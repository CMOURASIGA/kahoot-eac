# 🎯 Quiz Gamificado EAC (Kahoot Style)

Um projeto interativo de **quiz online** desenvolvido em **HTML + CSS + JavaScript**, integrado ao **Google Apps Script** e **Google Sheets**.  
Inspirado na experiência do Kahoot, o sistema oferece uma experiência envolvente, visualmente leve e fácil de operar — ideal para eventos, dinâmicas educacionais e encontros.

---

## 🚀 Funcionalidades

### 🎮 Para o Jogador
- Seleção rápida de quizzes disponíveis.
- Timer de 30 segundos por pergunta com alerta visual.
- Pontuação dinâmica com bônus de acertos consecutivos.
- Feedback visual e sonoro a cada resposta.
- Exibição do resultado final com percentual e emojis.
- Acesso direto ao **📊 Ranking do Quiz**.
- Histórico de **Atividade Recente** por quiz (últimas respostas).

### ⚙️ Para o Sistema (Apps Script)
- Registro completo de respostas em planilha Google Sheets.
- Gravação de **tempo de resposta (segundos)** e **índice da opção (0–3)**.
- Atualização automática do **Ranking** com base nos acertos.
- **Cache de gabarito** para alto desempenho com múltiplos jogadores.
- Funções administrativas para análise:
  - `getRanking(quizId)`
  - `getUltimosResultados(quizId, limit)`
  - `finalizarQuiz(nome, quizId)`
  - `saveResposta(nome, quizId, idPergunta, respostaIndex, tempoSegundos)`
  - `getGabaritoComCache(quizId)`

---

## 🧩 Estrutura da Planilha Google

| Aba | Descrição | Campos Principais |
|------|------------|------------------|
| **quiz_perguntas** | Banco de perguntas de todos os quizzes | `QuizID`, `ID_Pergunta`, `Pergunta`, `A`, `B`, `C`, `D`, `Correta` |
| **Respostas** | Respostas dos jogadores | `Timestamp`, `Nome_Jogador`, `ID_Quiz`, `ID_Pergunta`, `Resposta_Dada`, `Resposta_Correta`, `Status`, `Pergunta`, `Resposta_Idx`, `Tempo_Segundos` |
| **Ranking** | Ranking geral consolidado | `Nome`, `Quiz`, `Acertos` |

---

## 🛠️ Estrutura do Projeto

📁 quiz-eac/
│
├── index.html # Interface principal (frontend)
├── style.css # Estilos visuais e layout
├── script.js # Lógica do quiz (pode estar embutido no index)
│
└── code.gs # Backend em Google Apps Script


---

## ⚙️ Configuração no Google Apps Script

1. Crie um novo projeto no [Google Apps Script](https://script.google.com/).
2. Cole o conteúdo de `code.gs` no editor.
3. Vincule sua planilha do Google Sheets e ajuste o ID dentro do script (`const SS = SpreadsheetApp.openById('...');`).
4. Publique como WebApp:
   - Menu: **Publicar → Implementar como aplicativo da Web**
   - Executar como: **você mesmo**
   - Acesso: **Qualquer pessoa com o link**
5. Copie a **URL da WebApp**.
6. No `index.html`, o código `google.script.run` já cuida da integração com o backend.

---

## 🌐 Deploy do Frontend

Você pode publicar o `index.html`:
- No próprio Google Apps Script (como interface HTML do WebApp).
- Ou em plataformas como:
  - [Render](https://render.com)
  - [Netlify](https://www.netlify.com)
  - [Vercel](https://vercel.com)

A experiência é 100% responsiva, pensada para celular, tablet e desktop.

---

## 💾 Funcionalidades Técnicas Recentes

| Versão | Recurso | Descrição |
|---------|----------|-----------|
| v1.0 | Base do quiz | Estrutura HTML/JS e integração inicial com Apps Script |
| v1.1 | Ranking automático | Ranking atualizado via planilha “Ranking” |
| v1.2 | Atividade recente | Mostra últimas respostas por quiz |
| v1.3 | Registro detalhado | Grava `Resposta_Idx` (número da opção) e `Tempo_Segundos` |
| v1.4 | Cache de gabarito | Reduz leituras da aba `quiz_perguntas` em picos de acesso |
| v1.5 | Tela de resultados | Adiciona botão 📊 “Ver Ranking do Quiz” e tabela de atividades |
| v1.6 | Otimização geral | Feedback visual aprimorado, código modular e leve |

---

## 🧭 Próximas Etapas

- 🛠️ **Painel Admin** independente (export CSV, manutenção, monitoramento).
- 🏁 **Desempate no ranking** por tempo médio de resposta.
- ⚡ **Modo relâmpago** com tempo reduzido e pontuação extra.
- 🧾 **Certificados automáticos** via e-mail para desempenho acima de meta.

---

## 👨‍💻 Tecnologias Utilizadas

| Camada | Tecnologia |
|---------|-------------|
| **Frontend** | HTML5, CSS3, JavaScript Puro |
| **Backend** | Google Apps Script (JavaScript V8) |
| **Banco de Dados** | Google Sheets |
| **Hospedagem** | WebApp do Apps Script ou Render |
| **Integração** | `google.script.run` API nativa do GAS |

---

## 🧠 Lógica de Funcionamento

1. O usuário acessa o quiz → seleciona um quiz da lista.  
2. O sistema busca perguntas via `getPerguntas(quizId)`.  
3. Cada resposta é enviada para `saveResposta`, salvando:
   - Nome do jogador
   - ID do quiz e da pergunta
   - Alternativa selecionada (letra e índice)
   - Tempo de resposta (segundos)
4. Ao final, `finalizarQuiz` calcula acertos, atualiza o ranking e retorna o resultado.
5. A tela final mostra o desempenho e permite ver o ranking geral.


