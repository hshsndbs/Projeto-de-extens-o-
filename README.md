# Sala de Espera

Projeto de Extensão | Sistema de chat com Firebase, da disciplina de Desenvolvimento Híbrido.

Feito por Abner Gustavo Ribeiro Brito, aluno de Análise e Desenvolvimento de Sistemas na UVA.

É uma sala de espera de jogo em tempo real. Os jogadores entram com um apelido, conversam no chat e, quando todo mundo marca que está pronto, a partida pode ser iniciada.

**Aplicação:** https://sala-de-esper.netlify.app

## O que o sistema faz

- Entrada com apelido (login anônimo, não precisa de conta)
- Lista de jogadores atualizada em tempo real
- Botão "Estou pronto" para cada jogador
- Chat da sala com mensagens em tempo real
- "Iniciar partida" só libera com pelo menos 2 jogadores e todos prontos
- Quando a partida inicia, aparece a tela "Partida iniciada!" para todos ao mesmo tempo
- Se o jogador fecha a aba, ele sai da lista sozinho
- A sala reinicia quando entra o primeiro jogador numa sala vazia
- Modo demonstração: botão para adicionar até 4 bots de teste, assim dá para testar sozinho

## Tecnologias

- React + Vite
- Firebase Realtime Database
- Firebase Authentication (login anônimo)
- Netlify (deploy)

## Como o banco está organizado

```
salas/
  principal/
    status
    jogadores/{id}
    mensagens/{id}
```

As regras de segurança estão no arquivo `database.rules.json`. Só quem está autenticado consegue ler e escrever.

## Como rodar no computador

1. Clonar o repositório
2. `npm install`
3. `npm run dev`

A configuração do Firebase fica no topo do `app.js`. Para usar outro projeto, é só trocar o `firebaseConfig` e publicar as regras do `database.rules.json` na aba Regras do Realtime Database.

## Como testar

1. Abrir o link da aplicação
2. Digitar um apelido e entrar
3. Clicar em "Adicionar bot de teste" para simular outros jogadores
4. Clicar em "Estou pronto" e depois em "Iniciar partida"

Também dá para abrir o link em duas abas, que cada aba conta como um jogador diferente.
