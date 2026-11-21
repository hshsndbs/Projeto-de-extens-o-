# Especificação de Segurança — Sala de Espera

## 1. Invariantes de Dados
1. Todo acesso ao banco exige usuário autenticado com e-mail verificado (`request.auth != null && request.auth.token.email_verified == true`).
2. Todo documento em `salas/{salaId}/jogadores/{jogadorId}` pertence exclusivamente ao `uid` do usuário autenticado que o criou (`uid == request.auth.uid`), com `nome` entre 1 e 16 caracteres e `entrouEm` imutável.
3. Um jogador só pode alterar o `pronto` de outros jogadores durante a transição atômica em lote (`writeBatch`) de `salas/{salaId}.status` de `'iniciada'` para `'aguardando'` (verificada com `getAfter`).
4. Mensagens em `salas/{salaId}/mensagens/{mensagemId}` são imutáveis após criação (`update` e `delete` proibidos) e limitadas a 200 caracteres.

## 2. Payloads de Teste (Dirty Dozen)
1. Usuário não autenticado tentando criar jogador -> `PERMISSION_DENIED`
2. Usuário com `email_verified: false` tentando ler/escrever -> `PERMISSION_DENIED`
3. Criação de jogador com `uid` diferente de `request.auth.uid` (spoofing) -> `PERMISSION_DENIED`
4. Criação de jogador com `nome` acima de 16 caracteres -> `PERMISSION_DENIED`
5. Criação de jogador com campo extra não permitido (`isAdmin: true`) -> `PERMISSION_DENIED`
6. Criação de jogador já com `pronto: true` -> `PERMISSION_DENIED`
7. Atualização de `nome` ou `entrouEm` após criação -> `PERMISSION_DENIED`
8. Atualização do `pronto` de outro jogador enquanto a sala está `'aguardando'` -> `PERMISSION_DENIED`
9. Exclusão do documento de outro jogador (`existing().uid != request.auth.uid`) -> `PERMISSION_DENIED`
10. Mensagem com `texto` > 200 caracteres ou timestamp falsificado -> `PERMISSION_DENIED`
11. Tentativa de editar ou apagar uma mensagem existente -> `PERMISSION_DENIED`
12. Tentativa de criar documento em coleção arbitrária fora do blueprint -> `PERMISSION_DENIED`
