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
 * Busca informações completas de uma pergunta específica
 */
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
      indiceCorreto: letraCorreta && ['A','B','C','D'].includes(letraCorreta)
        ? letraCorreta.charCodeAt(0) - 65
        : null
    };
  } catch (error) {
    console.error('❌ Erro em getPerguntaInfo:', error);
    return null;
  }
}

/**
 * Grava uma resposta individual (com índice e tempo)
 */
function saveResposta(nome, quizId, idPergunta, respostaIndex, tempoSegundos) {
  try {
    let respostasSheet = SS.getSheetByName('Respostas');
    if (!respostasSheet) {
      respostasSheet = SS.insertSheet('Respostas');
      respostasSheet.getRange(1, 1, 1, 10).setValues([[
        'Timestamp',          // A
        'Nome_Jogador',       // B
        'ID_Quiz',            // C
        'ID_Pergunta',        // D
        'Resposta_Dada',      // E (A/B/C/D/TEMPO_ESGOTADO)
        'Resposta Correta',   // F (A/B/C/D)
        'Status',             // G (Correto/Errado/Tempo Esgotado)
        'Pergunta',           // H (enunciado)
        'Resposta_Idx',       // I (0..3)
        'Tempo_Segundos'      // J (0..30)
      ]]);
    } else {
      const header = respostasSheet.getRange(1, 1, 1, respostasSheet.getLastColumn()).getValues()[0];
      const needed = ['Resposta_Idx','Tempo_Segundos'];
      for (let need of needed) {
        if (!header.includes(need)) {
          respostasSheet.getRange(1, header.length + 1).setValue(need);
        }
      }
    }

    const perguntaInfo = getPerguntaInfo(quizId, idPergunta);

    let respostaCorreta = '';
    let status = '';
    let textoPergunta = '';

    if (perguntaInfo) {
      respostaCorreta = perguntaInfo.letraCorreta || '';
      textoPergunta = perguntaInfo.pergunta || '';
      if (respostaIndex === null || respostaIndex === 'TEMPO_ESGOTADO') {
        status = 'Tempo Esgotado';
      } else {
        status = (respostaIndex === perguntaInfo.indiceCorreto) ? 'Correto' : 'Errado';
      }
    }

    let respostaDada = '';
    if (typeof respostaIndex === 'number') {
      respostaDada = String.fromCharCode(65 + respostaIndex);
    } else if (respostaIndex === 'TEMPO_ESGOTADO' || respostaIndex === null) {
      respostaDada = 'TEMPO_ESGOTADO';
    }

    respostasSheet.appendRow([
      new Date(), nome, quizId, idPergunta, respostaDada, respostaCorreta, status, textoPergunta
    ]);

    const lastRow = respostasSheet.getLastRow();
    const idx = (typeof respostaIndex === 'number') ? respostaIndex : '';
    const tempo = (typeof tempoSegundos === 'number') ? tempoSegundos : '';
    respostasSheet.getRange(lastRow, 9).setValue(idx);    // I
    respostasSheet.getRange(lastRow, 10).setValue(tempo); // J
  } catch (error) {
    console.error('❌ Erro em saveResposta:', error);
    throw new Error(`Erro ao salvar resposta: ${error.message}`);
  }
}

/**
 * Calcula e retorna o resultado final de um jogador
 */
function finalizarQuiz(nome, quizId) {
  try {
    const gabarito = getGabaritoComCache(quizId) || {};
    const totalPerguntas = Object.keys(gabarito).length;

    const respostasSheet = SS.getSheetByName('Respostas');
    if (!respostasSheet) throw new Error('Aba "Respostas" não encontrada');

    const data = respostasSheet.getDataRange().getValues();
    if (data.length <= 1) {
      atualizarRankingComTempo(nome, quizId, 0);
      return { acertos: 0, total: totalPerguntas };
    }

    const header = data[0];
    const idxNome         = 1; // B
    const idxQuiz         = 2; // C
    const idxIdPergunta   = 3; // D
    const idxRespostaDada = header.indexOf('Resposta_Dada') >= 0 ? header.indexOf('Resposta_Dada') : 4; // E
    const idxRespostaIdx  = header.indexOf('Resposta_Idx'); // I (se existir)

    const respostasJogador = data.slice(1).filter(r =>
      r[idxNome] && r[idxQuiz] &&
      String(r[idxNome]).trim() === String(nome).trim() &&
      String(r[idxQuiz]).trim() === String(quizId).trim()
    );

    let acertos = 0;
    for (const resp of respostasJogador) {
      const idPerg = resp[idxIdPergunta];

      let respostaNum = null;
      if (idxRespostaIdx >= 0 && typeof resp[idxRespostaIdx] === 'number') {
        respostaNum = resp[idxRespostaIdx];
      } else {
        const rDada = resp[idxRespostaDada];
        if (rDada && rDada !== 'TEMPO_ESGOTADO') {
          if (typeof rDada === 'string' && rDada.length === 1) {
            const letra = rDada.toUpperCase();
            if (['A','B','C','D'].includes(letra)) respostaNum = letra.charCodeAt(0) - 65;
          } else if (typeof rDada === 'number') {
            respostaNum = rDada;
          }
        }
      }

      const corretaNum = gabarito[idPerg];
      if (typeof corretaNum === 'number' && respostaNum === corretaNum) acertos++;
    }

    atualizarRankingComTempo(nome, quizId, acertos);
    return { acertos, total: totalPerguntas };
  } catch (error) {
    console.error('❌ Erro em finalizarQuiz:', error);
    throw new Error(`Erro ao finalizar quiz: ${error.message}`);
  }
}

/**
 * Atualiza ou cria a linha do jogador na aba "Ranking" com TempoMedio
 * e invalida o cache de ranking do quiz.
 */
function atualizarRankingComTempo(nome, quizId, acertos) {
  let rankSheet = SS.getSheetByName('Ranking');
  if (!rankSheet) {
    rankSheet = SS.insertSheet('Ranking');
    rankSheet.getRange(1, 1, 1, 4).setValues([['Nome', 'Quiz', 'Acertos', 'TempoMedio']]);
  } else {
    const hdrNow = rankSheet.getRange(1, 1, 1, rankSheet.getLastColumn()).getValues()[0];
    if (!hdrNow.includes('TempoMedio')) {
      rankSheet.getRange(1, hdrNow.length + 1).setValue('TempoMedio');
    }
  }

  const tempoMedio = tempoMedioJogadorNoQuiz(nome, quizId);

  const vals = rankSheet.getDataRange().getValues();
  const hdr  = vals[0];
  const colTempo = hdr.indexOf('TempoMedio');
  const rowIdx = vals.findIndex((r, i) =>
    i > 0 &&
    String(r[0]).trim() === String(nome).trim() &&
    String(r[1]).trim() === String(quizId).trim()
  );

  if (rowIdx >= 1) {
    rankSheet.getRange(rowIdx + 1, 3).setValue(acertos); // Acertos
    if (colTempo >= 0 && tempoMedio !== null) {
      rankSheet.getRange(rowIdx + 1, colTempo + 1).setValue(tempoMedio);
    }
  } else {
    const nova = [nome, quizId, acertos];
    if (colTempo >= 0) nova.push(tempoMedio);
    rankSheet.appendRow(nova);
  }

  try {
    CacheService.getScriptCache().remove(`ranking_${quizId}`);
  } catch (_) {}
}

/**
 * Ranking completo do quiz (lendo apenas a aba Ranking) com cache leve
 */
function getRanking(quizId) {
  const cache = CacheService.getScriptCache();
  const key = `ranking_${quizId}`;
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (_) {}
  }

  const sh = SS.getSheetByName('Ranking');
  if (!sh) return [];

  const vals = sh.getDataRange().getValues();
  if (vals.length <= 1) return [];

  const hdr = vals[0];
  const colNome  = 0;
  const colQuiz  = 1;
  const colPts   = 2;
  const colTempo = hdr.indexOf('TempoMedio'); // -1 se não existir

  const list = vals.slice(1)
    .filter(r => r[colQuiz] && String(r[colQuiz]).trim() === String(quizId).trim())
    .map(r => ({
      nome: r[colNome],
      pontos: Number(r[colPts]) || 0,
      tempo: (colTempo >= 0 && typeof r[colTempo] === 'number') ? Number(r[colTempo]) : null
    }))
    .sort((a, b) => {
      if (b.pontos !== a.pontos) return b.pontos - a.pontos;
      if (a.tempo == null && b.tempo == null) return 0;
      if (a.tempo == null) return 1;
      if (b.tempo == null) return -1;
      return a.tempo - b.tempo;
    });

  // cache por 120s (ajuste conforme necessidade)
  cache.put(key, JSON.stringify(list), 120);
  return list;
}

/**
 * Últimos resultados por quiz (otimizado para planilhas grandes)
 */
function getUltimosResultados(quizId, limit) {
  try {
    const sh = SS.getSheetByName('Respostas');
    if (!sh) return [];
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return [];

    const MAX_SCAN = 1500; // examina no máximo as últimas N respostas
    const rowsToRead = Math.min(MAX_SCAN, lastRow - 1);
    const startRow = Math.max(2, lastRow - rowsToRead + 1);

    // Leia apenas A..H (ou aumente se precisar de mais colunas)
    const range = sh.getRange(startRow, 1, rowsToRead, 8); // A:H
    const data = range.getValues();

    const filtrados = data
      .filter(r => r[2] && r[2].toString().trim() === quizId.toString().trim())
      .map(r => ({
        timestamp: r[0],
        nome: r[1],
        quiz: r[2],
        idPergunta: r[3],
        respostaDada: r[4],
        respostaCorreta: r[5],
        status: r[6],
        pergunta: r[7]
      }))
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

    return filtrados.slice(0, Math.max(1, limit || 50));
  } catch (e) {
    console.error('getUltimosResultados fast', e);
    return [];
  }
}

/**
 * Gabarito com CacheService
 */
function getGabaritoComCache(quizId) {
  const cache = CacheService.getScriptCache();
  const key = `gabarito_${quizId}`;
  const cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {}
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

function limparCacheGabarito(quizId) {
  const cache = CacheService.getScriptCache();
  cache.remove(`gabarito_${quizId}`);
  return 'Cache limpo';
}

/**
 * Calcula tempo médio (em segundos) do jogador em um quiz.
 * Se não houver tempo salvo numa resposta, assume 30s.
 */
function tempoMedioJogadorNoQuiz(nome, quizId) {
  const sh = SS.getSheetByName('Respostas');
  if (!sh) return null;

  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return null;

  const header = data[0];
  const idxNome   = 1; // B
  const idxQuiz   = 2; // C
  const idxTempo  = header.indexOf('Tempo_Segundos'); // J (ou onde estiver)

  let soma = 0, n = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[idxNome]).trim() === String(nome).trim() &&
        String(r[idxQuiz]).trim() === String(quizId).trim()) {
      let t = 30;
      if (idxTempo >= 0 && typeof r[idxTempo] === 'number') t = r[idxTempo];
      soma += t;
      n++;
    }
  }

  if (!n) return null;
  return soma / n;
}

/**
 * Ferramentas utilitárias (opcionais)
 */
function atualizarRespostasExistentes() {
  try {
    const respostasSheet = SS.getSheetByName('Respostas');
    if (!respostasSheet) return 'Aba Respostas não encontrada';

    const data = respostasSheet.getDataRange().getValues();
    const header = data[0];

    if (header.length >= 8 && header[5] === 'Resposta Correta' && header[6] === 'Status' && header[7] === 'Pergunta') {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const quizId = row[2];
        const idPergunta = row[3];
        const respostaDada = row[4];

        const perguntaInfo = getPerguntaInfo(quizId, idPergunta);
        if (perguntaInfo) {
          let status = '';
          let respostaIndex = null;

          if (respostaDada && respostaDada !== 'TEMPO_ESGOTADO') {
            if (typeof respostaDada === 'string' && respostaDada.length === 1) {
              const letra = respostaDada.toUpperCase();
              if (['A', 'B', 'C', 'D'].includes(letra)) respostaIndex = letra.charCodeAt(0) - 65;
            } else if (typeof respostaDada === 'number') {
              respostaIndex = respostaDada;
            }
          }

          if (respostaDada === 'TEMPO_ESGOTADO' || respostaDada === null) {
            status = 'Tempo Esgotado';
          } else {
            status = (respostaIndex === perguntaInfo.indiceCorreto) ? 'Correto' : 'Errado';
          }

          respostasSheet.getRange(i + 1, 6).setValue(perguntaInfo.letraCorreta || ''); // F
          respostasSheet.getRange(i + 1, 7).setValue(status); // G
          respostasSheet.getRange(i + 1, 8).setValue(perguntaInfo.pergunta || ''); // H
        }
      }
      return 'Dados atualizados com sucesso';
    } else {
      const newHeader = [...header];
      while (newHeader.length < 8) {
        if (newHeader.length === 5) newHeader.push('Resposta Correta');
        else if (newHeader.length === 6) newHeader.push('Status');
        else if (newHeader.length === 7) newHeader.push('Pergunta');
      }
      respostasSheet.getRange(1, 1, 1, newHeader.length).setValues([newHeader]);
      return 'Novas colunas adicionadas. Execute novamente para preencher os dados.';
    }
  } catch (error) {
    console.error('❌ Erro em atualizarRespostasExistentes:', error);
    return `Erro: ${error.message}`;
  }
}

function testarEstrutura() {
  try {
    const planilha = SpreadsheetApp.openById('1bURN_kRxY4Q3lTxVSgn67URkVlUrBX0hfj3DMFlnqQ0');
    const sheetPerguntas = planilha.getSheetByName('quiz_perguntas');
    const sheetRespostas = planilha.getSheetByName('Respostas');
    const abas = planilha.getSheets().map(s => s.getName());
    return JSON.stringify({
      planilha: planilha.getName(),
      tem_quiz_perguntas: !!sheetPerguntas,
      tem_respostas: !!sheetRespostas,
      abas
    });
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return `Erro: ${error.message}`;
  }
}

/**
 * Recalcula o ranking de um quiz a partir da aba "Respostas"
 * e reescreve as linhas do quiz na aba "Ranking".
 * Retorna um resumo com contagens.
 */
/**
 * Recalcula o ranking de um quiz a partir da aba "Respostas"
 * e reescreve as linhas do quiz na aba "Ranking".
 * Funciona com cabeçalhos: Nome|Nome_Jogador, Quiz|Quiz_ID, Acertos|Pontuação, TempoMedio.
 */
/**
 * Recalcula o ranking de um quiz a partir da aba "Respostas"
 * e reescreve as linhas do quiz na aba "Ranking".
 * Funciona com cabeçalhos: Nome|Nome_Jogador, Quiz|Quiz_ID, Acertos|Pontuação, TempoMedio.
 */
function recomputarRankingQuiz(quizId) {
  if (!quizId) throw new Error('quizId obrigatório');

  // ===== Respostas =====
  const shResp = SS.getSheetByName('Respostas');
  if (!shResp) throw new Error('Aba "Respostas" não encontrada');

  const data = shResp.getDataRange().getValues();
  if (data.length <= 1) return { quizId, jogadores: 0, respostasConsideradas: 0 };

  const hdr = data[0];
  const idxNome   = 1; // B
  const idxQuiz   = 2; // C
  const idxPerg   = 3; // D
  const idxResp   = hdr.indexOf('Resposta_Dada') >= 0 ? hdr.indexOf('Resposta_Dada') : 4; // E
  const idxIdx    = hdr.indexOf('Resposta_Idx');     // I (se existir)
  const idxTempo  = hdr.indexOf('Tempo_Segundos');   // J (se existir)

  const gabarito = getGabaritoComCache(quizId) || {};

  // Agrupa por jogador
  const byPlayer = new Map();
  let respostasConsideradas = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[idxQuiz] || String(r[idxQuiz]).trim() !== String(quizId).trim()) continue;

    const nome = (r[idxNome] || '').toString().trim();
    if (!nome) continue;

    const idPerg = r[idxPerg];
    if (idPerg == null || gabarito[idPerg] == null) continue; // pergunta fora do quiz/gabarito

    // respostaNum: prefere índice; senão mapeia letra A..D
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

    // tempo (assume 30s quando ausente)
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

  // ===== Ranking (compatível com seus cabeçalhos) =====
  let shRank = SS.getSheetByName('Ranking');
  if (!shRank) {
    shRank = SS.insertSheet('Ranking');
    shRank.getRange(1, 1, 1, 4).setValues([['Nome', 'Quiz', 'Acertos', 'TempoMedio']]);
  }

  // Cabeçalho atual da aba Ranking
  const rankHdr = shRank.getRange(1, 1, 1, Math.max(4, shRank.getLastColumn())).getValues()[0];

  // Descobre colunas por nomes possíveis
  const colNome  = findHeaderIndex(rankHdr, ['Nome', 'Nome_Jogador'])        ?? 0;
  const colQuiz  = findHeaderIndex(rankHdr, ['Quiz', 'Quiz_ID'])              ?? 1;
  const colPts   = findHeaderIndex(rankHdr, ['Acertos', 'Pontuação', 'Pontos']) ?? 2;
  let   colTempo = findHeaderIndex(rankHdr, ['TempoMedio', 'Tempo_Medio', 'Tempo médio (s)']);

  // Garante coluna TempoMedio
  if (colTempo == null) {
    colTempo = rankHdr.length; // próxima coluna
    shRank.getRange(1, colTempo + 1).setValue('TempoMedio');
  }

  // Remove TODAS as linhas do quiz (de baixo pra cima) — FIX do seu caso
  const lastRowRank = shRank.getLastRow();
  for (let i = lastRowRank; i >= 2; i--) {
    const quizCell = shRank.getRange(i, colQuiz + 1).getValue();
    if (String(quizCell).trim() === String(quizId).trim()) {
      shRank.deleteRow(i);
    }
  }

  // Monta as novas linhas
  const rows = [];
  for (const [nome, agg] of byPlayer.entries()) {
    const tempoMedio = agg.nTempo ? (agg.somaTempo / agg.nTempo) : null;
    const row = [];
    row[colNome]  = nome;
    row[colQuiz]  = quizId;
    row[colPts]   = agg.acertos;
    row[colTempo] = tempoMedio;
    // ajusta tamanho para escrever contíguo desde a coluna 1
    const maxIndex = Math.max(colNome, colQuiz, colPts, colTempo);
    while (row.length < maxIndex + 1) row.push('');
    rows.push(row);
  }

  if (rows.length) {
    shRank.insertRowsAfter(1, rows.length);
    shRank.getRange(2, 1, rows.length, Math.max(rankHdr.length, colTempo + 1)).setValues(
      rows.map(r => {
        // completa com vazio até o mesmo número de colunas do cabeçalho atual
        const copy = r.slice();
        while (copy.length < Math.max(rankHdr.length, colTempo + 1)) copy.push('');
        return copy;
      })
    );
  }

  // Invalida cache do ranking do quiz
  try { CacheService.getScriptCache().remove(`ranking_${quizId}`); } catch (_) {}

  return { quizId, jogadores: rows.length, respostasConsideradas };
}

// Helper de cabeçalho: encontra índice pela primeira correspondência
function findHeaderIndex(headerArray, aliases) {
  for (const a of aliases) {
    const idx = headerArray.findIndex(h => (h || '').toString().trim().toLowerCase() === a.toLowerCase());
    if (idx >= 0) return idx;
  }
  return null;
}

/**
 * Recalcula o Ranking de TODOS os quizzes a partir da aba "Respostas".
 * Cuidado: pode ser pesado em planilhas gigantes. Use pontualmente.
 */
function recomputarRankingTodos() {
  const shResp = SS.getSheetByName('Respostas');
  if (!shResp) throw new Error('Aba "Respostas" não encontrada');

  const data = shResp.getDataRange().getValues();
  if (data.length <= 1) return { quizzes: 0, totalJogadores: 0 };

  const idxQuiz = 2; // C
  const quizzes = [...new Set(
    data.slice(1).map(r => r[idxQuiz]).filter(Boolean).map(v => String(v).trim())
  )];

  let totalJogadores = 0;
  for (const q of quizzes) {
    const res = recomputarRankingQuiz(q);
    totalJogadores += res.jogadores || 0;
  }
  return { quizzes: quizzes.length, totalJogadores };
}



