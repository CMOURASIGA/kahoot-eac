// =================================================================
// Bloco de Jogo em Tempo Real (Kahoot)
// =================================================================

const CACHE_EXPIRATION = 3600 * 4; // 4 horas

// --- Funções de Jogo ---

/**
 * Cria uma nova sessão de jogo para um quiz específico.
 * Chamado pelo anfitrião (host).
 * @param {string} quizId O ID do quiz a ser jogado.
 * @param {number} tempoPorPergunta O tempo em segundos para cada pergunta.
 * @param {string} modoDeJogo O modo de avanço ('automatico' ou 'manual').
 * @returns {object} Contendo { pin, hostId }
 */
function createGameSession(quizId, tempoPorPergunta, modoDeJogo) {
  const cache = CacheService.getScriptCache();
  const pin = generatePin();
  const hostId = Utilities.getUuid();

  const perguntas = getPerguntas(quizId);
  if (!perguntas || perguntas.length === 0) {
    throw new Error(`Quiz com ID '${quizId}' não encontrado ou não possui perguntas.`);
  }

  const gameState = {
    pin,
    hostId,
    quizId,
    perguntas,
    tempoPorPergunta: parseInt(tempoPorPergunta) > 0 ? parseInt(tempoPorPergunta) : 40,
    modoDeJogo: modoDeJogo === 'manual' ? 'manual' : 'automatico', // Adicionado
    players: {}, // { nome: { avatar, score } }
    status: 'LOBBY', // LOBBY, QUESTION, LEADERBOARD, FINAL
    currentQuestionIndex: -1,
    questionStartTime: null,
    answers: {}, // { nome: { answerIdx, time, score } }
    lastAnswers: {}, // Adicionado para feedback
    leaderboard: []
  };

  cache.put(pin, JSON.stringify(gameState), CACHE_EXPIRATION);
  return { pin, hostId };
}

/**
 * Permite que um jogador entre em um jogo existente.
 * @param {string} pin O PIN do jogo.
 * @param {string} nome O nome do jogador.
 * @param {string} avatar O avatar do jogador.
 * @returns {object} O estado atual do jogo.
 */
function joinGame(pin, nome, avatar) {
  const cache = CacheService.getScriptCache();
  const gameJSON = cache.get(pin);
  if (!gameJSON) throw new Error("Jogo não encontrado. Verifique o PIN.");

  const gameState = JSON.parse(gameJSON);
  if (gameState.status !== 'LOBBY') throw new Error("Este jogo já começou.");
  if (gameState.players[nome]) throw new Error("Este nome já está em uso neste jogo.");

  gameState.players[nome] = { avatar: avatar, score: 0, correctCount: 0 };
  
  cache.put(pin, JSON.stringify(gameState), CACHE_EXPIRATION);
  return gameState;
}

/**
 * Retorna o estado atual de um jogo.
 * Usado por todos os clientes (jogadores e host) para polling.
 * @param {string} pin O PIN do jogo.
 * @returns {object} O estado do jogo. Partes sensíveis (respostas corretas) são removidas.
 */
function getGameState(pin) {
  const cache = CacheService.getScriptCache();
  const gameJSON = cache.get(pin);
  if (!gameJSON) return null; // Jogo não existe mais

  const gameState = JSON.parse(gameJSON);
  
  // Remove dados sensíveis antes de enviar para os clientes
  const clientState = JSON.parse(JSON.stringify(gameState)); // Deep copy
  if (clientState.perguntas) {
    clientState.perguntas.forEach(p => {
      delete p.correta;
      delete p.letraCorreta;
    });
  }
  
  // Revela a resposta correta da pergunta ANTERIOR nos estágios apropriados
  if (clientState.status === 'ANSWER_REVEAL' || clientState.status === 'LEADERBOARD' || clientState.status === 'FINAL') {
    const lastQuestionIndex = clientState.currentQuestionIndex;
    if (lastQuestionIndex >= 0 && gameState.perguntas[lastQuestionIndex]) {
       clientState.lastCorrectAnswer = gameState.perguntas[lastQuestionIndex].correta;
    }
  }

  return clientState;
}

/**
 * Inicia o jogo. Apenas o anfitrião pode chamar.
 * @param {string} pin O PIN do jogo.
 * @param {string} hostId O UUID do anfitrião para autorização.
 */
function startGame(pin, hostId) {
  const cache = CacheService.getScriptCache();
  const gameState = getAndValidateState(pin, hostId, cache);

  if (gameState.status !== 'LOBBY') throw new Error("O jogo já começou.");

  gameState.status = 'QUESTION';
  gameState.currentQuestionIndex = 0;
  gameState.questionStartTime = Date.now();
  gameState.answers = {};
  
  cache.put(pin, JSON.stringify(gameState), CACHE_EXPIRATION);
  return gameState;
}

/**
 * Avança o estado do jogo (ex: de Pergunta para Placar, de Placar para Próxima Pergunta).
 * Apenas o anfitrião pode chamar.
 * @param {string} pin O PIN do jogo.
 * @param {string} hostId O UUID do anfitrião.
 */
function nextGameState(pin, hostId) {
  const cache = CacheService.getScriptCache();
  const gameState = getAndValidateState(pin, hostId, cache);

  switch (gameState.status) {
    case 'QUESTION':
      // Transição de Pergunta -> Revelação da Resposta
      gameState.status = 'ANSWER_REVEAL';
      gameState.lastAnswers = { ...gameState.answers }; // Salva as respostas da rodada
      break;

    case 'ANSWER_REVEAL':
      // Transição de Revelação -> Placar
      gameState.status = 'LEADERBOARD';
      updateLeaderboard(gameState);
      break;
      
    case 'LEADERBOARD':
      // Transição de Placar -> Próxima Pergunta ou Final
      const nextIndex = gameState.currentQuestionIndex + 1;
      if (nextIndex < gameState.perguntas.length) {
        gameState.status = 'QUESTION';
        gameState.currentQuestionIndex = nextIndex;
        gameState.questionStartTime = Date.now();
        gameState.answers = {}; // Limpa as respostas para a nova pergunta
      } else {
        gameState.status = 'FINAL';
        updateLeaderboard(gameState); // Ranking final
      }
      break;
  }
  
  cache.put(pin, JSON.stringify(gameState), CACHE_EXPIRATION);
  return gameState;
}


/**
 * Um jogador envia sua resposta.
 * @param {string} pin O PIN do jogo.
 * @param {string} nome O nome do jogador.
 * @param {number} respostaIdx O índice da resposta escolhida (0-3).
 * @param {number} tempoGasto O tempo em segundos que o jogador levou.
 */
function submitAnswer(pin, nome, respostaIdx, tempoGasto) {
  const cache = CacheService.getScriptCache();
  const gameJSON = cache.get(pin);
  if (!gameJSON) throw new Error("Jogo não encontrado.");

  const gameState = JSON.parse(gameJSON);

  if (gameState.status !== 'QUESTION') throw new Error("A votação está encerrada.");
  if (gameState.answers[nome]) throw new Error("Você já respondeu a esta pergunta.");
  if (!gameState.players[nome]) throw new Error("Jogador não encontrado nesta partida.");

  const question = gameState.perguntas[gameState.currentQuestionIndex];
  const isCorrect = (question.correta === respostaIdx);
  
  // Lógica de pontuação: mais pontos por responder mais rápido
  let points = 0;
  if (isCorrect) {
    const timeFactor = (gameState.tempoPorPergunta - tempoGasto) / gameState.tempoPorPergunta; // ex: 0 a 1
    points = 500 + Math.round(500 * timeFactor); // Base 500, bônus de até 500
  }

  gameState.answers[nome] = { respostaIdx, tempoGasto, points };
  gameState.players[nome].score += points;
  if (isCorrect) {
    gameState.players[nome].correctCount = (gameState.players[nome].correctCount || 0) + 1;
  }
  
  // Salva a resposta individual na planilha para análise posterior
  try {
     saveResposta(nome, gameState.quizId, question.id, respostaIdx, tempoGasto);
  } catch(e) {
    console.error(`Falha ao salvar resposta individual para ${nome}: ${e.toString()}`);
  }
  
  cache.put(pin, JSON.stringify(gameState), CACHE_EXPIRATION);
  return { pointsEarned: points };
}


// --- Funções Auxiliares do Jogo ---

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getAndValidateState(pin, hostId, cache) {
  const gameJSON = cache.get(pin);
  if (!gameJSON) throw new Error("Jogo não encontrado.");
  
  const gameState = JSON.parse(gameJSON);
  if (gameState.hostId !== hostId) throw new Error("Apenas o anfitrião pode realizar esta ação.");
  
  return gameState;
}

function updateLeaderboard(gameState) {
    const playerNames = Object.keys(gameState.players);
    const leaderboard = playerNames.map(name => ({
      nome: name,
      avatar: gameState.players[name].avatar,
      score: gameState.players[name].score,
      correctCount: gameState.players[name].correctCount || 0
    }));

    leaderboard.sort((a, b) => b.score - a.score);
    gameState.leaderboard = leaderboard;
}

// =================================================================
// Bloco Original (com adaptações)
// =================================================================

// Referência fixa à planilha
const SS = SpreadsheetApp.openById('1bURN_kRxY4Q3lTxVSgn67URkVlUrBX0hfj3DMFlnqQ0');

/**
 * Ponto de entrada do WebApp
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Quiz EAC')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Inclui arquivos HTML separados
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Lista todos os quizzes disponíveis
 */
function getQuizzes() {
  try {
    const sheet = SS.getSheetByName('quiz_perguntas');
    if (!sheet) throw new Error('Aba "quiz_perguntas" não encontrada na planilha');

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];

    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Coluna A
    const quizzes = [...new Set(data.flat().filter(item => item && item.toString().trim()))];

    return quizzes.map(nome => ({ id: nome, nome }));
  } catch (error) {
    console.error('❌ Erro em getQuizzes:', error);
    throw new Error(`Erro ao buscar quizzes: ${error.message}`);
  }
}

/**
 * Retorna todas as perguntas de um quiz específico
 */
function getPerguntas(quizID) {
  try {
    const sheet = SS.getSheetByName('quiz_perguntas');
    if (!sheet) throw new Error('Aba "quiz_perguntas" não encontrada na planilha');

    const data = sheet.getDataRange().getValues();

    const perguntas = data
      .slice(1)
      .filter(row => row[0] && row[0].toString().trim() === quizID.toString().trim())
      .map((row, index) => {
        if (!row[1] || !row[2]) return null;

        let respostaCorreta = null;
        let letraCorreta = null;
        if (row[7]) {
          const letra = row[7].toString().trim().toUpperCase();
          if (['A', 'B', 'C', 'D'].includes(letra)) {
            respostaCorreta = letra.charCodeAt(0) - 65; // 'A' => 0
            letraCorreta = letra;
          } else {
            return null;
          }
        } else {
          return null;
        }

        return {
          id: row[1] ? row[1].toString().trim() : `pergunta_${index + 1}`,
          pergunta: row[2].toString().trim(),
          opcoes: [
            row[3] ? row[3].toString().trim() : '',
            row[4] ? row[4].toString().trim() : '',
            row[5] ? row[5].toString().trim() : '',
            row[6] ? row[6].toString().trim() : ''
          ].filter(op => op),
          correta: respostaCorreta,
          letraCorreta
        };
      })
      .filter(pergunta => pergunta !== null && pergunta.opcoes.length === 4);

    if (perguntas.length === 0) {
      throw new Error(`Nenhuma pergunta válida encontrada para o quiz "${quizID}".`);
    }

    return perguntas;
  } catch (error) {
    console.error('❌ Erro em getPerguntas:', error);
    throw new Error(`Erro ao buscar perguntas: ${error.message}`);
  }
}

/**
 * Grava uma resposta individual (com índice e tempo)
 */
function saveResposta(nome, quizId, idPergunta, respostaIdx, tempoSegundos) {
  try {
    const sh = SS.getSheetByName('Respostas');
    if (!sh) throw new Error('Aba "Respostas" não encontrada');

    const now = new Date();
    const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    const idxRespDada = hdr.indexOf('Resposta_Dada');
    const idxRespIdx  = hdr.indexOf('Resposta_Idx');
    const idxTempo    = hdr.indexOf('Tempo_Segundos');

    const linha = new Array(hdr.length).fill('');
    linha[0] = now;
    linha[1] = nome;
    linha[2] = quizId;
    linha[3] = idPergunta;

    if (idxRespDada >= 0) linha[idxRespDada] = (Number.isInteger(respostaIdx) ? String.fromCharCode(65 + respostaIdx) : 'TEMPO_ESGOTADO');
    if (idxRespIdx  >= 0) linha[idxRespIdx]  = Number.isInteger(respostaIdx) ? respostaIdx : '';
    if (idxTempo    >= 0) linha[idxTempo]    = (typeof tempoSegundos === 'number') ? tempoSegundos : '';

    sh.appendRow(linha);
  } catch (e) {
    console.error("Falha em saveResposta:", e);
    // Não lançar erro para não quebrar a execução do jogo principal
  }
}

// Manter as funções abaixo para compatibilidade ou uso futuro, mas não são centrais para o novo modo de jogo
function getPerguntaInfo(quizId, idPergunta) {
  try {
    const sheet = SS.getSheetByName('quiz_perguntas');
    if (!sheet) throw new Error('Aba "quiz_perguntas" não encontrada na planilha');
    const data = sheet.getDataRange().getValues();
    const perguntaRow = data.find(row =>
      row[0] && row[1] &&
      row[0].toString().trim() === quizId.toString().trim() &&
      row[1].toString().trim() === idPergunta.toString().trim()
    );
    if (!perguntaRow) return null;
    const letraCorreta = perguntaRow[7] ? perguntaRow[7].toString().trim().toUpperCase() : null;
    return {
      pergunta: perguntaRow[2] ? perguntaRow[2].toString().trim() : '',
      letraCorreta,
      indiceCorreto: letraCorreta && ['A','B','C','D'].includes(letraCorreta) ? letraCorreta.charCodeAt(0) - 65 : null
    };
  } catch (error) {
    console.error('❌ Erro em getPerguntaInfo:', error);
    return null;
  }
}

function recomputarRankingQuiz(quizId) {
  // Esta função pode precisar de ajustes ou ser depreciada em favor do ranking ao vivo
  // Por enquanto, a mantemos como está.
  if (!quizId) throw new Error('quizId obrigatório');
  const shResp = SS.getSheetByName('Respostas');
  if (!shResp) throw new Error('Aba "Respostas" não encontrada');
  const data = shResp.getDataRange().getValues();
  if (data.length <= 1) return { quizId, jogadores: 0, respostasConsideradas: 0 };
  const hdr = data[0];
  const idxNome   = 1; const idxQuiz   = 2; const idxPerg   = 3;
  const idxResp   = hdr.indexOf('Resposta_Dada') >= 0 ? hdr.indexOf('Resposta_Dada') : 4;
  const idxIdx    = hdr.indexOf('Resposta_Idx');
  const idxTempo  = hdr.indexOf('Tempo_Segundos');
  const gabarito = getGabaritoComCache(quizId) || {};
  const byPlayer = new Map();
  let respostasConsideradas = 0;
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[idxQuiz] || String(r[idxQuiz]).trim() !== String(quizId).trim()) continue;
    const nome = (r[idxNome] || '').toString().trim();
    if (!nome) continue;
    const idPerg = r[idxPerg];
    if (idPerg == null || gabarito[idPerg] == null) continue;
    let respostaNum = null;
    if (idxIdx >= 0 && typeof r[idxIdx] === 'number') {
      respostaNum = r[idxIdx];
    } else {
      const respDada = r[idxResp];
      if (respDada && respDada !== 'TEMPO_ESGOTADO') {
        if (typeof respDada === 'string' && respDada.length === 1) {
          const letra = respDada.toUpperCase();
          if (['A','B','C','D'].includes(letra)) respostaNum = letra.charCodeAt(0) - 65;
        } else if (typeof respDada === 'number') {
          respostaNum = respDada;
        }
      }
    }
    let t = 30;
    if (idxTempo >= 0 && typeof r[idxTempo] === 'number') t = r[idxTempo];
    if (!byPlayer.has(nome)) byPlayer.set(nome, { acertos: 0, somaTempo: 0, nTempo: 0 });
    const agg = byPlayer.get(nome);
    const corretaNum = gabarito[idPerg];
    if (typeof corretaNum === 'number' && respostaNum === corretaNum) agg.acertos++;
    agg.somaTempo += t;
    agg.nTempo += 1;
    respostasConsideradas++;
  }
  let shRank = SS.getSheetByName('Ranking');
  if (!shRank) {
    shRank = SS.insertSheet('Ranking');
    shRank.getRange(1, 1, 1, 4).setValues([['Nome', 'Quiz', 'Acertos', 'TempoMedio']]);
  }
  const rankHdr = shRank.getRange(1, 1, 1, Math.max(4, shRank.getLastColumn())).getValues()[0];
  const colNome  = findHeaderIndex(rankHdr, ['Nome', 'Nome_Jogador'])        ?? 0;
  const colQuiz  = findHeaderIndex(rankHdr, ['Quiz', 'Quiz_ID'])              ?? 1;
  const colPts   = findHeaderIndex(rankHdr, ['Acertos', 'Pontuação', 'Pontos']) ?? 2;
  let   colTempo = findHeaderIndex(rankHdr, ['TempoMedio', 'Tempo_Medio', 'Tempo médio (s)']);
  if (colTempo == null) {
    colTempo = rankHdr.length;
    shRank.getRange(1, colTempo + 1).setValue('TempoMedio');
  }
  const lastRowRank = shRank.getLastRow();
  for (let i = lastRowRank; i >= 2; i--) {
    const quizCell = shRank.getRange(i, colQuiz + 1).getValue();
    if (String(quizCell).trim() === String(quizId).trim()) {
      shRank.deleteRow(i);
    }
  }
  const rows = [];
  for (const [nome, agg] of byPlayer.entries()) {
    const tempoMedio = agg.nTempo ? (agg.somaTempo / agg.nTempo) : null;
    const row = [];
    row[colNome]  = nome;
    row[colQuiz]  = quizId;
    row[colPts]   = agg.acertos;
    row[colTempo] = tempoMedio;
    const maxIndex = Math.max(colNome, colQuiz, colPts, colTempo);
    while (row.length < maxIndex + 1) row.push('');
    rows.push(row);
  }
  if (rows.length) {
    shRank.insertRowsAfter(1, rows.length);
    shRank.getRange(2, 1, rows.length, Math.max(rankHdr.length, colTempo + 1)).setValues(
      rows.map(r => {
        const copy = r.slice();
        while (copy.length < Math.max(rankHdr.length, colTempo + 1)) copy.push('');
        return copy;
      })
    );
  }
  try { CacheService.getScriptCache().remove(`ranking_${quizId}`); } catch (_) {}
  return { quizId, jogadores: rows.length, respostasConsideradas };
}

function findHeaderIndex(headerArray, aliases) {
  for (const a of aliases) {
    const idx = headerArray.findIndex(h => (h || '').toString().trim().toLowerCase() === a.toLowerCase());
    if (idx >= 0) return idx;
  }
  return null;
}

function getGabaritoComCache(quizId) {
  const cache = CacheService.getScriptCache();
  const key = `gabarito_${quizId}`;
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const perguntasSheet = SS.getSheetByName('quiz_perguntas');
  if (!perguntasSheet) return {};

  const perguntasData = perguntasSheet.getDataRange().getValues();
  const gabarito = {};
  perguntasData.slice(1).forEach(row => {
    if (row[0] && row[0].toString().trim() === quizId.toString().trim()) {
      const letra = row[7] ? row[7].toString().trim().toUpperCase() : null;
      if (letra && ['A','B','C','D'].includes(letra)) {
        gabarito[row[1]] = letra.charCodeAt(0) - 65; // A=0 ...
      }
    }
  });

  cache.put(key, JSON.stringify(gabarito), 600); // 10 minutos
  return gabarito;
}
