
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
    console.log('🔍 Buscando quizzes disponíveis...');
    
    const sheet = SS.getSheetByName('quiz_perguntas');
    if (!sheet) {
      throw new Error('Aba "quiz_perguntas" não encontrada na planilha');
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log('⚠️ Nenhum dado encontrado na planilha');
      return [];
    }
    
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Coluna A, a partir da linha 2
    const quizzes = [...new Set(data.flat().filter(item => item && item.toString().trim()))]; // remove duplicados e vazios
    
    console.log('✅ Quizzes encontrados:', quizzes);
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
    console.log('🔍 Buscando perguntas para quiz:', quizID);
    
    const sheet = SS.getSheetByName('quiz_perguntas');
    if (!sheet) {
      throw new Error('Aba "quiz_perguntas" não encontrada na planilha');
    }
    
    const data = sheet.getDataRange().getValues();
    console.log('📊 Dados brutos da planilha:', data.length, 'linhas');
    
    const perguntas = data
      .slice(1) // Remove cabeçalho
      .filter(row => row[0] && row[0].toString().trim() === quizID.toString().trim()) // Filtra pelo quiz
      .map((row, index) => {
        try {
          // Validação dos dados da linha
          if (!row[1] || !row[2]) {
            console.warn(`⚠️ Linha ${index + 2} incompleta:`, row);
            return null;
          }
          
          // Converte a resposta correta de letra para número
          let respostaCorreta = null;
          let letraCorreta = null;
          if (row[7]) {
            const letra = row[7].toString().trim().toUpperCase();
            if (['A', 'B', 'C', 'D'].includes(letra)) {
              respostaCorreta = letra.charCodeAt(0) - 65; // 'A' => 0, 'B' => 1, etc.
              letraCorreta = letra;
            } else {
              console.warn(`⚠️ Resposta correta inválida na linha ${index + 2}:`, letra);
              return null;
            }
          } else {
            console.warn(`⚠️ Resposta correta não informada na linha ${index + 2}`);
            return null;
          }
          
          return {
            id: row[1] ? row[1].toString().trim() : `pergunta_${index + 1}`, // ID da pergunta
            pergunta: row[2].toString().trim(),
            opcoes: [
              row[3] ? row[3].toString().trim() : '',
              row[4] ? row[4].toString().trim() : '',
              row[5] ? row[5].toString().trim() : '',
              row[6] ? row[6].toString().trim() : ''
            ].filter(opcao => opcao), // Remove opções vazias
            correta: respostaCorreta,
            letraCorreta: letraCorreta // Adiciona a letra correta para usar na planilha
          };
        } catch (error) {
          console.error(`❌ Erro ao processar linha ${index + 2}:`, error, row);
          return null;
        }
      })
      .filter(pergunta => pergunta !== null && pergunta.opcoes.length === 4); // Remove perguntas inválidas
    
    console.log('✅ Perguntas processadas:', perguntas.length);
    console.log('📝 Primeira pergunta como exemplo:', perguntas[0]);
    
    if (perguntas.length === 0) {
      throw new Error(`Nenhuma pergunta válida encontrada para o quiz "${quizID}". Verifique se os dados estão corretos na planilha.`);
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
    if (!sheet) {
      throw new Error('Aba "quiz_perguntas" não encontrada na planilha');
    }
    
    const data = sheet.getDataRange().getValues();
    
    // Encontra a linha da pergunta específica
    const perguntaRow = data.find(row => 
      row[0] && row[1] && 
      row[0].toString().trim() === quizId.toString().trim() && 
      row[1].toString().trim() === idPergunta.toString().trim()
    );
    
    if (!perguntaRow) {
      return null;
    }
    
    const letraCorreta = perguntaRow[7] ? perguntaRow[7].toString().trim().toUpperCase() : null;
    
    return {
      pergunta: perguntaRow[2] ? perguntaRow[2].toString().trim() : '',
      letraCorreta: letraCorreta,
      indiceCorreto: letraCorreta && ['A', 'B', 'C', 'D'].includes(letraCorreta) ? 
                     letraCorreta.charCodeAt(0) - 65 : null
    };
    
  } catch (error) {
    console.error('❌ Erro em getPerguntaInfo:', error);
    return null;
  }
}

/**
 * Grava uma resposta individual com informações completas para o dashboard
 */
function saveResposta(nome, quizId, idPergunta, respostaIndex, tempoSegundos) {
  try {
    // Garante a planilha de respostas e cabeçalho
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
      // Se a aba já existia, garante as colunas I e J
      const header = respostasSheet.getRange(1, 1, 1, respostasSheet.getLastColumn()).getValues()[0];
      const needed = ['Resposta_Idx','Tempo_Segundos'];
      for (let need of needed) {
        if (!header.includes(need)) {
          respostasSheet.getRange(1, header.length + 1).setValue(need);
        }
      }
    }

    // Busca infos da pergunta (letra correta, índice correto, texto)
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

    // Converte índice para letra
    let respostaDada = '';
    if (typeof respostaIndex === 'number') {
      respostaDada = String.fromCharCode(65 + respostaIndex); // 0=A, 1=B...
    } else if (respostaIndex === 'TEMPO_ESGOTADO' || respostaIndex === null) {
      respostaDada = 'TEMPO_ESGOTADO';
    }

    // Grava linha base (A:H)
    respostasSheet.appendRow([
      new Date(), nome, quizId, idPergunta, respostaDada, respostaCorreta, status, textoPergunta
    ]);

    // Preenche I e J (Resposta_Idx, Tempo_Segundos)
    const lastRow = respostasSheet.getLastRow();
    const idx = (typeof respostaIndex === 'number') ? respostaIndex : '';
    const tempo = (typeof tempoSegundos === 'number') ? tempoSegundos : '';
    respostasSheet.getRange(lastRow, 9).setValue(idx);    // I
    respostasSheet.getRange(lastRow, 10).setValue(tempo); // J

    // pronto!
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
    // 1) Gabarito com cache
    const gabarito = getGabaritoComCache(quizId);

    // 2) Lê respostas do jogador
    const respostasSheet = SS.getSheetByName('Respostas');
    if (!respostasSheet) {
      throw new Error('Aba "Respostas" não encontrada');
    }
    const respostasData = respostasSheet.getDataRange().getValues();
    const header = respostasData[0];
    const idxRespostaIdx = header.indexOf('Resposta_Idx');      // I
    const idxRespostaDada = 4;                                   // E
    const idxIdPergunta   = 3;                                   // D
    const respostasJogador = respostasData
      .slice(1)
      .filter(r => r[1] && r[2] &&
        r[1].toString().trim() === nome.toString().trim() &&
        r[2].toString().trim() === quizId.toString().trim());

    // 3) Consolida acertos
    let acertos = 0;
    respostasJogador.forEach(resp => {
      const idPerg = resp[idxIdPergunta];

      // Preferir Resposta_Idx se existir
      let respostaNum = null;
      if (idxRespostaIdx >= 0 && typeof resp[idxRespostaIdx] === 'number') {
        respostaNum = resp[idxRespostaIdx];
      } else {
        // fallback: converter letra de Resposta_Dada
        const respostaIndex = resp[idxRespostaDada];
        if (respostaIndex && respostaIndex !== 'TEMPO_ESGOTADO') {
          if (typeof respostaIndex === 'string' && respostaIndex.length === 1) {
            const letra = respostaIndex.toUpperCase();
            if (['A','B','C','D'].includes(letra)) {
              respostaNum = letra.charCodeAt(0) - 65;
            }
          } else if (typeof respostaIndex === 'number') {
            respostaNum = respostaIndex;
          }
        }
      }

      if (respostaNum !== null && gabarito[idPerg] === respostaNum) {
        acertos++;
      }
    });

    const totalPerguntas = Object.keys(gabarito).length;

    // 4) Atualiza Ranking (igual você já fazia)
    try {
      let rankSheet = SS.getSheetByName('Ranking');
      if (!rankSheet) {
        rankSheet = SS.insertSheet('Ranking');
        rankSheet.getRange(1, 1, 1, 3).setValues([['Nome', 'Quiz', 'Acertos']]);
      }

      const dadosRank = rankSheet.getDataRange().getValues();
      const linha = dadosRank.findIndex(r =>
        r[0] && r[1] &&
        r[0].toString().trim() === nome.toString().trim() &&
        r[1].toString().trim() === quizId.toString().trim()
      );

      if (linha >= 0) {
        rankSheet.getRange(linha + 1, 3).setValue(acertos);
      } else {
        rankSheet.appendRow([nome, quizId, acertos]);
      }
    } catch (rankError) {
      console.warn('⚠️ Erro ao atualizar ranking:', rankError);
    }

    return { acertos, total: totalPerguntas };
  } catch (error) {
    console.error('❌ Erro em finalizarQuiz:', error);
    throw new Error(`Erro ao finalizar quiz: ${error.message}`);
  }
}


/**
 * Retorna o ranking completo do quiz
 */
function getRanking(quizId) {
  try {
    const rankSheet = SS.getSheetByName('Ranking');
    if (!rankSheet) {
      return [];
    }
    
    const dados = rankSheet.getDataRange().getValues()
      .slice(1) // Remove cabeçalho
      .filter(r => r[1] && r[1].toString().trim() === quizId.toString().trim());
    
    dados.sort((a, b) => (b[2] || 0) - (a[2] || 0)); // Ordena por pontuação
    
    return dados.map(r => ({ 
      nome: r[0] || '', 
      pontos: r[2] || 0 
    }));
    
  } catch (error) {
    console.error('❌ Erro em getRanking:', error);
    return [];
  }
}

/**
 * Função para atualizar respostas existentes (caso precise migrar dados antigos)
 */
function atualizarRespostasExistentes() {
  try {
    console.log('🔄 Atualizando respostas existentes...');
    
    const respostasSheet = SS.getSheetByName('Respostas');
    if (!respostasSheet) {
      console.log('⚠️ Aba Respostas não encontrada');
      return 'Aba Respostas não encontrada';
    }
    
    const data = respostasSheet.getDataRange().getValues();
    const header = data[0];
    
    // Verifica se já tem as novas colunas
    if (header.length >= 8 && header[5] === 'Resposta Correta' && header[6] === 'Status' && header[7] === 'Pergunta') {
      console.log('✅ Colunas já existem, atualizando dados...');
      
      // Atualiza cada linha de dados
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const quizId = row[2];
        const idPergunta = row[3];
        const respostaDada = row[4];
        
        // Busca informações da pergunta
        const perguntaInfo = getPerguntaInfo(quizId, idPergunta);
        
        if (perguntaInfo) {
          let status = '';
          let respostaIndex = null;
          
          // Converte resposta dada para índice
          if (respostaDada && respostaDada !== 'TEMPO_ESGOTADO') {
            if (typeof respostaDada === 'string' && respostaDada.length === 1) {
              const letra = respostaDada.toUpperCase();
              if (['A', 'B', 'C', 'D'].includes(letra)) {
                respostaIndex = letra.charCodeAt(0) - 65;
              }
            } else if (typeof respostaDada === 'number') {
              respostaIndex = respostaDada;
            }
          }
          
          // Determina status
          if (respostaDada === 'TEMPO_ESGOTADO' || respostaDada === null) {
            status = 'Tempo Esgotado';
          } else {
            status = (respostaIndex === perguntaInfo.indiceCorreto) ? 'Correto' : 'Errado';
          }
          
          // Atualiza as colunas F, G, H
          respostasSheet.getRange(i + 1, 6).setValue(perguntaInfo.letraCorreta || ''); // F: Resposta Correta
          respostasSheet.getRange(i + 1, 7).setValue(status); // G: Status
          respostasSheet.getRange(i + 1, 8).setValue(perguntaInfo.pergunta || ''); // H: Pergunta
        }
      }
      
      console.log('✅ Dados atualizados com sucesso');
      return 'Dados atualizados com sucesso';
      
    } else {
      console.log('📝 Adicionando novas colunas...');
      
      // Adiciona as novas colunas ao cabeçalho
      const newHeader = [...header];
      while (newHeader.length < 8) {
        if (newHeader.length === 5) newHeader.push('Resposta Correta');
        else if (newHeader.length === 6) newHeader.push('Status');
        else if (newHeader.length === 7) newHeader.push('Pergunta');
      }
      
      respostasSheet.getRange(1, 1, 1, newHeader.length).setValues([newHeader]);
      
      console.log('✅ Novas colunas adicionadas, execute novamente para preencher os dados');
      return 'Novas colunas adicionadas, execute novamente para preencher os dados';
    }
    
  } catch (error) {
    console.error('❌ Erro em atualizarRespostasExistentes:', error);
    return `Erro: ${error.message}`;
  }
}

/**
 * Função de teste para verificar a estrutura da planilha
 */
function testarEstrutura() {
  try {
    console.log('🧪 Testando estrutura da planilha...');
    
    // Testa se a planilha existe
    const planilha = SpreadsheetApp.openById('1bURN_kRxY4Q3lTxVSgn67URkVlUrBX0hfj3DMFlnqQ0');
    console.log('✅ Planilha encontrada:', planilha.getName());
    
    // Testa a aba quiz_perguntas
    const sheetPerguntas = planilha.getSheetByName('quiz_perguntas');
    if (sheetPerguntas) {
      const dados = sheetPerguntas.getDataRange().getValues();
      console.log('✅ Aba quiz_perguntas encontrada com', dados.length, 'linhas');
      console.log('📋 Cabeçalho:', dados[0]);
      if (dados.length > 1) {
        console.log('📝 Primeira linha de dados:', dados[1]);
      }
    } else {
      console.log('❌ Aba quiz_perguntas não encontrada');
    }
    
    // Testa a aba Respostas
    const sheetRespostas = planilha.getSheetByName('Respostas');
    if (sheetRespostas) {
      const dados = sheetRespostas.getDataRange().getValues();
      console.log('✅ Aba Respostas encontrada com', dados.length, 'linhas');
      console.log('📋 Cabeçalho:', dados[0]);
    } else {
      console.log('⚠️ Aba Respostas não encontrada (será criada automaticamente)');
    }
    
    // Testa outras abas
    const abas = planilha.getSheets().map(sheet => sheet.getName());
    console.log('📂 Abas disponíveis:', abas);
    
    return 'Teste concluído - verifique o console para detalhes';
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return `Erro: ${error.message}`;
  }
}
// NOVA: últimos resultados por quiz (limite configurável)
function getUltimosResultados(quizId, limit) {
  try {
    const sh = SS.getSheetByName('Respostas');
    if (!sh) return [];
    const data = sh.getDataRange().getValues().slice(1); // remove cabeçalho
    const filtrados = data
      .filter(r => r[2] && r[2].toString().trim() === quizId.toString().trim())
      .map(r => ({
        timestamp: r[0],       // Timestamp
        nome: r[1],            // Nome_Jogador
        quiz: r[2],            // ID_Quiz
        idPergunta: r[3],      // ID_Pergunta
        respostaDada: r[4],    // Resposta_Dada (A/B/C/D/TEMPO_ESGOTADO)
        respostaCorreta: r[5], // Resposta Correta (A/B/C/D)
        status: r[6],          // Status
        pergunta: r[7]         // Pergunta (se você quiser exibir depois)
      }))
      .sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    return filtrados.slice(0, Math.max(1, limit || 50));
  } catch (e) {
    console.error('getUltimosResultados', e);
    return [];
  }
}
function getGabaritoComCache(quizId) {
  const cache = CacheService.getScriptCache();
  const key = `gabarito_${quizId}`;
  const cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {
      // se der erro de parse, segue fluxo e recalcula
    }
  }

  // Calcula do zero
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

  // Cache por 10 min (600s)
  cache.put(key, JSON.stringify(gabarito), 600);
  return gabarito;
}
function limparCacheGabarito(quizId) {
  const cache = CacheService.getScriptCache();
  cache.remove(`gabarito_${quizId}`);
  return 'Cache limpo';
}


