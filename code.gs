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
function saveResposta(nome, quizId, idPergunta, respostaIdx, tempoSegundos) {
  const sh = SS.getSheetByName('Respostas');
  if (!sh) throw new Error('Aba "Respostas" não encontrada');

  const now = new Date();
  // cabeçalho esperado (ajuste se seu cabeçalho tiver outros nomes)
  // [Timestamp, Nome_Jogador, Quiz_ID, ID_Pergunta, Resposta_Dada, ..., Resposta_Idx, Tempo_Segundos]
  const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const idxRespDada = hdr.indexOf('Resposta_Dada'); // mantém compatibilidade
  const idxRespIdx  = hdr.indexOf('Resposta_Idx');
  const idxTempo    = hdr.indexOf('Tempo_Segundos');

  const linha = new Array(hdr.length).fill('');
  linha[0] = now;
  linha[1] = nome;
  linha[2] = quizId;
  linha[3] = idPergunta;

  // Se quiser continuar registrando a “letra”, deixe vazio ou converta o índice
  if (idxRespDada >= 0) linha[idxRespDada] = (Number.isInteger(respostaIdx) ? String.fromCharCode(65 + respostaIdx) : 'TEMPO_ESGOTADO');
  if (idxRespIdx  >= 0) linha[idxRespIdx]  = Number.isInteger(respostaIdx) ? respostaIdx : '';
  if (idxTempo    >= 0) linha[idxTempo]    = (typeof tempoSegundos === 'number') ? tempoSegundos : '';

  // Acrescente colunas extras que já usa (Status, Correta, etc) se quiser
  sh.appendRow(linha);
}


/**
 * Calcula e retorna o resultado final de um jogador
 */
function finalizarQuiz(nome, quizId) {
  const shResp = SS.getSheetByName('Respostas');
  const gabarito = getGabaritoComCache(quizId) || {};
  const data = shResp.getDataRange().getValues();
  const hdr  = data[0];

  const iNome = 1, iQuiz = 2, iPerg = 3;
  const iIdx  = hdr.indexOf('Resposta_Idx');
  const iDada = (hdr.indexOf('Resposta_Dada') >= 0) ? hdr.indexOf('Resposta_Dada') : -1;

  let acertos=0, total=0;

  for (let i=1;i<data.length;i++){
    const r = data[i];
    if (String(r[iQuiz]).trim() !== String(quizId).trim()) continue;
    if (String(r[iNome]).trim() !== String(nome).trim()) continue;

    const idPerg = r[iPerg];
    if (idPerg == null || gabarito[idPerg] == null) continue;

    let respostaNum = null;
    if (iIdx >= 0 && typeof r[iIdx] === 'number') {
      respostaNum = r[iIdx];
    } else if (iDada >= 0) {
      const v = r[iDada];
      if (typeof v === 'string' && v.length===1 && 'ABCD'.includes(v.toUpperCase()))
        respostaNum = v.toUpperCase().charCodeAt(0) - 65;
    }

    total++;
    if (respostaNum === gabarito[idPerg]) acertos++;
  }
  return { acertos, total };
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
  const sh = SS.getSheetByName('Ranking');
  if (!sh) return [];

  const data = sh.getDataRange().getValues();
  const hdr  = data[0];
  const iNome  = headerIndex(hdr, ['Nome','Nome_Jogador']);
  const iQuiz  = headerIndex(hdr, ['Quiz','Quiz_ID']);
  const iPts   = headerIndex(hdr, ['Acertos','Pontuação','Pontos']);
  const iTempo = headerIndex(hdr, ['TempoMedio','Tempo_Medio','Tempo médio (s)']);

  const rows = [];
  for (let i=1;i<data.length;i++){
    const r = data[i];
    if (String(r[iQuiz]).trim() !== String(quizId).trim()) continue;
    rows.push({
      nome:   r[iNome],
      pontos: Number(r[iPts]) || 0,
      tempo:  (iTempo>=0 && r[iTempo] !== '') ? Number(r[iTempo]) : null
    });
  }

  // mesma ordenação usada no front
  rows.sort((a,b)=>{
    if (b.pontos !== a.pontos) return b.pontos - a.pontos;            // mais acertos primeiro
    if (a.tempo == null && b.tempo != null) return 1;                 // quem não tem tempo, vai depois
    if (a.tempo != null && b.tempo == null) return -1;
    if (a.tempo != null && b.tempo != null) return a.tempo - b.tempo; // menor tempo primeiro
    return 0;
  });
  return rows;
}

function headerIndex(hdr, aliases){
  for (const a of aliases){
    const i = hdr.findIndex(h => (h||'').toString().trim().toLowerCase() === a.toLowerCase());
    if (i>=0) return i;
  }
  return -1;
}


/**
 * Últimos resultados por quiz (otimizado para planilhas grandes)
 */
function getUltimosResultados(quizId, limit) {
  const sh = SS.getSheetByName('Respostas');
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  const hdr = data[0];

  const iTs   = 0;
  const iNome = 1;
  const iQuiz = 2;
  const iPerg = 3;
  const iStat = hdr.indexOf('Status');
  const iDada = hdr.indexOf('Resposta_Dada');
  const iCorr = hdr.indexOf('Resposta_Correta');

  const rows = [];
  for (let i=1;i<data.length;i++){
    const r = data[i];
    if (String(r[iQuiz]).trim() !== String(quizId).trim()) continue;
    rows.push({
      timestamp: r[iTs],
      nome: r[iNome],
      idPergunta: r[iPerg],
      status: iStat>=0 ? r[iStat] : '',
      respostaDada: iDada>=0 ? r[iDada] : '',
      respostaCorreta: iCorr>=0 ? r[iCorr] : ''
    });
  }
  rows.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
  return rows.slice(0, limit || 30);
}

/*
geração de numeros reais da tela inicial
*/
function getStats() {
  const shResp = SS.getSheetByName('Respostas');
  const shPerg = SS.getSheetByName('quiz_perguntas');
  const totalPerguntas = shPerg ? (shPerg.getLastRow()-1) : 0;

  let jogadores = new Set();
  let respostas = 0;
  if (shResp && shResp.getLastRow()>1){
    const data = shResp.getRange(2,1,shResp.getLastRow()-1,2).getValues(); // timestamp, nome
    respostas = data.length;
    data.forEach(r => { if (r[1]) jogadores.add(String(r[1]).trim()); });
  }
  return {
    totalPerguntas,
    totalJogadores: jogadores.size,
    totalRespostas: respostas
  };
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
