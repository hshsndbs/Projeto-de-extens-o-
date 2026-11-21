// ============================================================================
// 1. IMPORTAÇÃO DO FIREBASE (SDK MODULAR VIA CDN DO GSTATIC)
// ============================================================================
// Usamos a versão modular direto da CDN oficial do Google (gstatic), sem
// precisar de React, bundler ou etapa de build para publicar no Netlify.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limitToLast,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ============================================================================
// 2. CONFIGURAÇÃO DO FIREBASE (PROJETO PROVISIONADO)
// ============================================================================
// Credenciais do projeto Firebase conectado a este aplicativo.
const firebaseConfig = {
  apiKey: "AIzaSyC9f1YES8H3iTf1zwE60W3JUe8Yf4uDfpQ",
  authDomain: "synthetic-brand-w8gvj.firebaseapp.com",
  projectId: "synthetic-brand-w8gvj",
  storageBucket: "synthetic-brand-w8gvj.firebasestorage.app",
  messagingSenderId: "846446343687",
  appId: "1:846446343687:web:918b05f0f4ca6cdb019ca2",
  firestoreDatabaseId: "ai-studio-saladeesperalobb-bfd1fe66-fe93-4381-89b2-47686d4241a4"
};

// ============================================================================
// 3. TRATAMENTO ESTRUTURADO DE ERROS DO FIRESTORE
// ============================================================================
const OperationType = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  LIST: "list",
  GET: "get",
  WRITE: "write"
};

function handleFirestoreError(error, operationType, path) {
  const user = auth ? auth.currentUser : null;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid || null,
      email: user?.email || null,
      emailVerified: user?.emailVerified ?? null,
      isAnonymous: user?.isAnonymous ?? null,
      tenantId: user?.tenantId || null,
      providerInfo:
        user?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// 4. REFERÊNCIAS AOS ELEMENTOS DO HTML (DOM)
// ============================================================================
const configWarning = document.getElementById("config-warning");
const headerPlayerInfo = document.getElementById("header-player-info");
const headerPlayerName = document.getElementById("header-player-name");
const btnLeaveRoom = document.getElementById("btn-leave-room");

// Telas principais
const screenLogin = document.getElementById("screen-login");
const screenLobby = document.getElementById("screen-lobby");
const screenStarted = document.getElementById("screen-started");

// Elementos de autenticação Google
const authStatusText = document.getElementById("auth-status-text");
const btnGoogleLogin = document.getElementById("btn-google-login");
const authSignedInBar = document.getElementById("auth-signed-in-bar");
const authUserEmail = document.getElementById("auth-user-email");
const btnGoogleLogout = document.getElementById("btn-google-logout");

// Elementos da tela de login (apelido)
const loginForm = document.getElementById("login-form");
const nicknameInput = document.getElementById("nickname-input");
const nicknameCounter = document.getElementById("nickname-counter");
const loginError = document.getElementById("login-error");
const btnEnter = document.getElementById("btn-enter");

// Elementos da sala de espera
const playersCounter = document.getElementById("players-counter");
const playersList = document.getElementById("players-list");
const btnReady = document.getElementById("btn-ready");
const btnStart = document.getElementById("btn-start");
const startHint = document.getElementById("start-hint");
const btnAddBot = document.getElementById("btn-add-bot");
const btnRemoveBots = document.getElementById("btn-remove-bots");
const demoSoloTip = document.getElementById("demo-solo-tip");

// Elementos do chat
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const btnClearChat = document.getElementById("btn-clear-chat");

// Elementos da tela "Partida iniciada!"
const startedPlayersList = document.getElementById("started-players-list");
const btnBackLobby = document.getElementById("btn-back-lobby");

// ============================================================================
// 5. ESTADO LOCAL E IDENTIFICAÇÃO POR ABA (sessionStorage)
// ============================================================================
// O sessionStorage é isolado por aba do navegador. Assim, ao abrir duas abas
// no mesmo computador para testar, cada aba gera seu próprio ID de jogador.
function obterOuCriarIdDaAba() {
  let id = sessionStorage.getItem("sala_jogador_id");
  if (!id) {
    id = "jog_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    sessionStorage.setItem("sala_jogador_id", id);
  }
  return id;
}

const meuId = obterOuCriarIdDaAba();
let meuNome = "";
let usuarioAtual = null;
let tokenAtual = "";
let estouNaSala = false;
let estouPronto = false;
let jogadoresAtuais = {};
let statusAtualDaSala = "aguardando";

// Controladores dos listeners em tempo real e heartbeat de presença
let unsubSala = null;
let unsubJogadores = null;
let unsubMensagens = null;
let intervaloPresenca = null;
// Mapa de temporizadores ativos por bot (evita agendar o mesmo bot duas vezes)
const timersPorBot = new Map();

// ============================================================================
// 6. INICIALIZAÇÃO DO FIREBASE (AUTH + FIRESTORE) E TESTE DE CONEXÃO
// ============================================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Passar o firestoreDatabaseId é obrigatório para conectar ao banco provisionado
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const googleProvider = new GoogleAuthProvider();

// Caminhos no Firestore:
// salas/principal
// salas/principal/jogadores/{id}
// salas/principal/mensagens
const salaRef = doc(db, "salas", "principal");
const jogadoresRef = collection(db, "salas", "principal", "jogadores");
const meuJogadorRef = doc(db, "salas", "principal", "jogadores", meuId);
const mensagensRef = collection(db, "salas", "principal", "mensagens");

// Valida conectividade inicial com o servidor do Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Verifique a configuração do Firebase: o cliente está offline.");
      configWarning.classList.remove("hidden");
    }
  }
}
testConnection();

// ============================================================================
// 7. FUNÇÕES AUXILIARES DE INTERFACE (SEGURANÇA COM textContent)
// ============================================================================
function mostrarTela(nomeDaTela) {
  screenLogin.classList.add("hidden");
  screenLobby.classList.add("hidden");
  screenStarted.classList.add("hidden");

  if (nomeDaTela === "login") {
    screenLogin.classList.remove("hidden");
  } else if (nomeDaTela === "lobby") {
    screenLobby.classList.remove("hidden");
  } else if (nomeDaTela === "started") {
    screenStarted.classList.remove("hidden");
  }
}

function formatarHora(valorTimestamp) {
  if (!valorTimestamp) return "--:--";
  // No Firestore, serverTimestamp() retorna um objeto Timestamp com .toDate()
  const data =
    typeof valorTimestamp.toDate === "function"
      ? valorTimestamp.toDate()
      : new Date(valorTimestamp);
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

function obterMilissegundos(valorTimestamp) {
  if (!valorTimestamp) return Date.now();
  if (typeof valorTimestamp.toMillis === "function") return valorTimestamp.toMillis();
  if (typeof valorTimestamp.toDate === "function") return valorTimestamp.toDate().getTime();
  return Number(valorTimestamp) || Date.now();
}

nicknameInput.addEventListener("input", () => {
  nicknameCounter.textContent = `${nicknameInput.value.length}/16`;
  loginError.classList.add("hidden");
});

// ============================================================================
// 8. FLUXO DE AUTENTICAÇÃO GOOGLE (onAuthStateChanged + signInWithPopup)
// ============================================================================
onAuthStateChanged(auth, async (user) => {
  usuarioAtual = user;

  if (user) {
    // Guarda o token JWT atualizado para limpeza rápida via keepalive ao fechar a aba
    try {
      tokenAtual = await user.getIdToken();
    } catch {
      tokenAtual = "";
    }

    authStatusText.classList.add("hidden");
    btnGoogleLogin.classList.add("hidden");
    authSignedInBar.classList.remove("hidden");
    authUserEmail.textContent = user.email || user.displayName || "Conta conectada";
    loginForm.classList.remove("hidden");

    // Preenche sugestão de apelido se o campo estiver vazio
    if (!nicknameInput.value.trim() && user.displayName) {
      const primeiroNome = user.displayName.split(" ")[0].slice(0, 16);
      nicknameInput.value = primeiroNome;
      nicknameCounter.textContent = `${primeiroNome.length}/16`;
    }

    // Ao carregar a página, verifica se já existe algum bot aguardando no banco
    verificarBotsPendentesAoCarregar();
  } else {
    tokenAtual = "";
    pararObservadores();
    estouNaSala = false;
    headerPlayerInfo.classList.add("hidden");

    authStatusText.textContent = "Faça login com sua conta Google para entrar na sala:";
    authStatusText.classList.remove("hidden");
    btnGoogleLogin.classList.remove("hidden");
    authSignedInBar.classList.add("hidden");
    loginForm.classList.add("hidden");
    mostrarTela("login");
  }
});

btnGoogleLogin.addEventListener("click", async () => {
  loginError.classList.add("hidden");
  btnGoogleLogin.disabled = true;
  btnGoogleLogin.textContent = "Conectando...";

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (erro) {
    console.error("Erro no login Google:", erro);
    authStatusText.textContent = "Não foi possível concluir o login Google. Tente novamente.";
  } finally {
    btnGoogleLogin.disabled = false;
    btnGoogleLogin.textContent = "Entrar com Google";
  }
});

btnGoogleLogout.addEventListener("click", async () => {
  try {
    await sairDaSala();
    await signOut(auth);
  } catch (erro) {
    console.error("Erro ao sair da conta:", erro);
  }
});

// ============================================================================
// 9. ENTRAR NA SALA E REMOVER AUTOMATICAMENTE AO FECHAR A ABA
// ============================================================================
loginForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!usuarioAtual) return;

  const apelido = nicknameInput.value.trim().slice(0, 16);
  if (apelido.length === 0) {
    loginError.textContent = "Digite um apelido antes de entrar na sala.";
    loginError.classList.remove("hidden");
    nicknameInput.focus();
    return;
  }

  btnEnter.disabled = true;
  btnEnter.textContent = "Entrando...";

  try {
    tokenAtual = await usuarioAtual.getIdToken();
    meuNome = apelido;

    // Garante que o documento principal da sala exista no Firestore
    let salaSnap;
    try {
      salaSnap = await getDoc(salaRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "salas/principal");
    }

    if (!salaSnap.exists()) {
      try {
        await setDoc(salaRef, {
          status: "aguardando",
          atualizadoEm: serverTimestamp()
        });
        statusAtualDaSala = "aguardando";
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, "salas/principal");
      }
    } else {
      statusAtualDaSala = salaSnap.data().status || "aguardando";
    }

    // Remove eventual registro residual desta aba antes de verificar se a sala está vazia
    await deleteDoc(meuJogadorRef).catch(() => {});

    // Verifica quantos jogadores ativos existem na sala neste momento
    let snapJogadoresAntes;
    try {
      snapJogadoresAntes = await getDocs(jogadoresRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, "salas/principal/jogadores");
    }

    const agora = Date.now();
    let jogadoresAtivos = 0;
    snapJogadoresAntes.forEach((docSnap) => {
      const dados = docSnap.data();
      const ultimo = obterMilissegundos(dados.ultimoSinal);
      if (agora - ultimo <= 60000 || dados.bot === true) {
        jogadoresAtivos++;
      }
    });

    // Se a sala estiver vazia (este jogador é o primeiro), limpa o chat
    // anterior e garante que o status da sala volte para "aguardando"
    if (jogadoresAtivos === 0) {
      await apagarTodasAsMensagens();
      if (salaSnap.exists() && statusAtualDaSala !== "aguardando") {
        try {
          await updateDoc(salaRef, {
            status: "aguardando",
            atualizadoEm: serverTimestamp()
          });
          statusAtualDaSala = "aguardando";
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, "salas/principal");
        }
      }
    }

    // Registra este jogador (por aba) em salas/principal/jogadores/{id}
    try {
      await setDoc(meuJogadorRef, {
        uid: usuarioAtual.uid,
        nome: meuNome,
        pronto: false,
        entrouEm: serverTimestamp(),
        ultimoSinal: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `salas/principal/jogadores/${meuId}`);
    }

    estouNaSala = true;
    estouPronto = false;

    // Envia mensagem de sistema informando que o jogador entrou na sala
    try {
      await addDoc(mensagensRef, {
        uid: usuarioAtual.uid,
        tipo: "sistema",
        autor: "Sistema",
        texto: `${meuNome} entrou na sala`,
        hora: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "salas/principal/mensagens");
    }

    // Inicia observadores em tempo real e o heartbeat de presença da aba
    iniciarObservadoresEmTempoReal();
    iniciarHeartbeatDePresenca();

    headerPlayerName.textContent = meuNome;
    headerPlayerInfo.classList.remove("hidden");

    if (statusAtualDaSala === "iniciada") {
      mostrarTela("started");
    } else {
      mostrarTela("lobby");
    }
  } catch (erro) {
    console.error("Erro ao entrar na sala:", erro);
    estouNaSala = false;
    loginError.textContent = "Não foi possível entrar na sala. Tente novamente.";
    loginError.classList.remove("hidden");
  } finally {
    btnEnter.disabled = false;
    btnEnter.textContent = "Entrar na sala";
  }
});

// Remove o jogador da sala de forma limpa (botão "Sair da sala")
async function sairDaSala() {
  pararObservadores();
  if (!estouNaSala) return;

  estouNaSala = false;
  try {
    await deleteDoc(meuJogadorRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `salas/principal/jogadores/${meuId}`);
  }
  headerPlayerInfo.classList.add("hidden");
  mostrarTela("login");
}

btnLeaveRoom.addEventListener("click", () => {
  sairDaSala();
});

// Remove o jogador automaticamente se fechar ou recarregar a aba do navegador
function removerAoFecharAba() {
  if (!estouNaSala || !usuarioAtual) return;

  // 1) Tenta remover via SDK Firestore
  deleteDoc(meuJogadorRef).catch(() => {});

  // 2) Envia DELETE REST com keepalive:true para garantir execução mesmo após fechar a aba
  if (tokenAtual) {
    const restUrl =
      `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}` +
      `/databases/${firebaseConfig.firestoreDatabaseId}/documents/salas/principal/jogadores/${meuId}`;

    fetch(restUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenAtual}`
      },
      keepalive: true
    }).catch(() => {});
  }
}

window.addEventListener("pagehide", removerAoFecharAba);
window.addEventListener("beforeunload", removerAoFecharAba);

// Atualiza o campo ultimoSinal a cada 15 segundos enquanto a aba estiver aberta
function iniciarHeartbeatDePresenca() {
  if (intervaloPresenca) clearInterval(intervaloPresenca);
  intervaloPresenca = setInterval(async () => {
    if (!estouNaSala || !usuarioAtual) return;
    try {
      tokenAtual = await usuarioAtual.getIdToken();
      await updateDoc(meuJogadorRef, {
        ultimoSinal: serverTimestamp()
      });
    } catch {
      // Ignora falhas transitórias de heartbeat
    }
  }, 15000);
}

// ============================================================================
// 10. OBSERVADORES EM TEMPO REAL (onSnapshot)
// ============================================================================
function pararObservadores() {
  if (unsubSala) {
    unsubSala();
    unsubSala = null;
  }
  if (unsubJogadores) {
    unsubJogadores();
    unsubJogadores = null;
  }
  if (unsubMensagens) {
    unsubMensagens();
    unsubMensagens = null;
  }
  if (intervaloPresenca) {
    clearInterval(intervaloPresenca);
    intervaloPresenca = null;
  }
  limparTimersDeBots();
}

function limparTimersDeBots() {
  timersPorBot.forEach((timerId) => clearTimeout(timerId));
  timersPorBot.clear();
}

function iniciarObservadoresEmTempoReal() {
  pararObservadores();

  // 10A. Observa o status da sala (aguardando / iniciada)
  unsubSala = onSnapshot(
    salaRef,
    (snapshot) => {
      const dados = snapshot.data();
      statusAtualDaSala = dados?.status || "aguardando";

      if (!estouNaSala) return;

      if (statusAtualDaSala === "iniciada") {
        mostrarTela("started");
      } else {
        mostrarTela("lobby");
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "salas/principal");
    }
  );

  // 10B. Observa a lista de jogadores em tempo real
  unsubJogadores = onSnapshot(
    jogadoresRef,
    (snapshot) => {
      const mapa = {};
      const agora = Date.now();

      snapshot.forEach((docSnap) => {
        const dados = docSnap.data();
        const ultimo = obterMilissegundos(dados.ultimoSinal);
        // Mantém jogadores ativos, a própria aba e os bots do modo demonstração
        if (agora - ultimo <= 60000 || docSnap.id === meuId || dados.bot === true) {
          mapa[docSnap.id] = dados;
        }

        // Se algum bot ainda estiver com pronto: false, agenda sua confirmação automática
        if (dados.bot === true && dados.pronto === false) {
          agendarBotPendente(docSnap.id, dados.nome || "Bot", true);
        }
      });

      jogadoresAtuais = mapa;
      renderizarListaDeJogadores(jogadoresAtuais);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, "salas/principal/jogadores");
    }
  );

  // 10C. Observa as últimas 60 mensagens do chat ordenadas por horário
  const consultaMensagens = query(mensagensRef, orderBy("hora", "asc"), limitToLast(60));
  unsubMensagens = onSnapshot(
    consultaMensagens,
    (snapshot) => {
      const lista = [];
      snapshot.forEach((docSnap) => {
        lista.push(docSnap.data());
      });
      renderizarChat(lista);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, "salas/principal/mensagens");
    }
  );
}

// ============================================================================
// 11. RENDERIZAÇÃO DA LISTA DE JOGADORES E REGRAS DOS BOTÕES
// ============================================================================
function renderizarListaDeJogadores(dadosJogadores) {
  playersList.textContent = "";
  startedPlayersList.textContent = "";

  const lista = Object.entries(dadosJogadores).sort((a, b) => {
    return obterMilissegundos(a[1].entrouEm) - obterMilissegundos(b[1].entrouEm);
  });

  const totalJogadores = lista.length;
  let quantidadeProntos = 0;
  let quantidadeBots = 0;

  lista.forEach(([id, jogador]) => {
    if (jogador.bot === true) quantidadeBots++;
    const estaPronto = Boolean(jogador.pronto);
    if (estaPronto) quantidadeProntos++;

    if (id === meuId) {
      estouPronto = estaPronto;
      atualizarBotaoPronto();
    }

    // Construção segura do DOM usando textContent (nunca innerHTML)
    const item = document.createElement("li");
    item.className = "player-item";

    const blocoNome = document.createElement("div");
    blocoNome.className = "player-name-wrap";

    const spanNome = document.createElement("span");
    spanNome.className = "player-name";
    spanNome.textContent = jogador.nome || "Jogador";
    blocoNome.appendChild(spanNome);

    if (id === meuId) {
      const spanVoce = document.createElement("span");
      spanVoce.className = "player-self-tag";
      spanVoce.textContent = "(Você)";
      blocoNome.appendChild(spanVoce);
    }

    const spanStatus = document.createElement("span");
    spanStatus.className = estaPronto ? "player-status is-ready" : "player-status is-waiting";
    spanStatus.textContent = estaPronto ? "Pronto" : "Aguardando";

    item.appendChild(blocoNome);
    item.appendChild(spanStatus);
    playersList.appendChild(item);

    const itemPartida = document.createElement("li");
    itemPartida.textContent = id === meuId ? `${jogador.nome} (Você)` : jogador.nome;
    startedPlayersList.appendChild(itemPartida);
  });

  // Atualiza os botões de bots (desabilita "Adicionar bot" ao atingir 4 bots)
  atualizarBotoesDeBots(quantidadeBots);

  // Mostra a dica quando a sala estiver com apenas 1 jogador e sem nenhum bot
  if (totalJogadores === 1 && quantidadeBots === 0) {
    demoSoloTip.classList.remove("hidden");
  } else {
    demoSoloTip.classList.add("hidden");
  }

  const textoJogador = totalJogadores === 1 ? "jogador na sala" : "jogadores na sala";
  playersCounter.textContent = `${totalJogadores} ${textoJogador} · ${quantidadeProntos} pronto(s)`;

  const todosProntos = totalJogadores >= 2 && quantidadeProntos === totalJogadores;
  btnStart.disabled = !todosProntos;

  if (totalJogadores < 2) {
    startHint.textContent = "Necessário no mínimo 2 jogadores na sala para iniciar.";
  } else if (!todosProntos) {
    startHint.textContent = "Aguardando todos os jogadores ficarem prontos.";
  } else {
    startHint.textContent = "Todos estão prontos. A partida já pode começar.";
  }
}

function atualizarBotaoPronto() {
  if (estouPronto) {
    btnReady.textContent = "Cancelar pronto";
    btnReady.classList.remove("btn-primary");
    btnReady.classList.add("btn-secondary-ready");
  } else {
    btnReady.textContent = "Estou pronto";
    btnReady.classList.remove("btn-secondary-ready");
    btnReady.classList.add("btn-primary");
  }
}

// ============================================================================
// 12. AÇÕES DO JOGADOR (PRONTO, CHAT, INICIAR E VOLTAR)
// ============================================================================
btnReady.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  try {
    await updateDoc(meuJogadorRef, {
      pronto: !estouPronto,
      ultimoSinal: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `salas/principal/jogadores/${meuId}`);
  }
});

chatForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!estouNaSala || !usuarioAtual) return;

  const texto = chatInput.value.trim().slice(0, 200);
  if (!texto) return;

  chatInput.value = "";

  try {
    await addDoc(mensagensRef, {
      uid: usuarioAtual.uid,
      tipo: "usuario",
      autor: meuNome,
      texto: texto,
      hora: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, "salas/principal/mensagens");
  }
});

function renderizarChat(listaMensagens) {
  chatMessages.textContent = "";
  btnClearChat.disabled = listaMensagens.length === 0;

  if (listaMensagens.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "chat-empty";
    vazio.textContent = "Nenhuma mensagem ainda. Diga olá para a sala.";
    chatMessages.appendChild(vazio);
    return;
  }

  listaMensagens.forEach((msg) => {
    if (msg.tipo === "sistema") {
      const linhaSistema = document.createElement("div");
      linhaSistema.className = "chat-system";

      const textoSistema = document.createElement("span");
      textoSistema.textContent = msg.texto || "";

      const horaSistema = document.createElement("span");
      horaSistema.className = "chat-time";
      horaSistema.textContent = formatarHora(msg.hora);

      linhaSistema.appendChild(textoSistema);
      linhaSistema.appendChild(horaSistema);
      chatMessages.appendChild(linhaSistema);
    } else {
      const caixaMsg = document.createElement("div");
      caixaMsg.className = "chat-message";

      const meta = document.createElement("div");
      meta.className = "chat-message-meta";

      const autor = document.createElement("span");
      autor.className = "chat-author";
      autor.textContent = msg.autor || "Jogador";

      const hora = document.createElement("span");
      hora.className = "chat-time";
      hora.textContent = formatarHora(msg.hora);

      meta.appendChild(autor);
      meta.appendChild(hora);

      const corpo = document.createElement("p");
      corpo.className = "chat-text";
      corpo.textContent = msg.texto || "";

      caixaMsg.appendChild(meta);
      caixaMsg.appendChild(corpo);
      chatMessages.appendChild(caixaMsg);
    }
  });

  // Rolagem automática para a mensagem mais recente
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Botão "Iniciar partida": altera status da sala para "iniciada"
btnStart.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual || btnStart.disabled) return;

  try {
    await updateDoc(salaRef, {
      status: "iniciada",
      atualizadoEm: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, "salas/principal");
  }
});

// Botão "Voltar para a sala": zera o "pronto" de todos e volta para "aguardando"
// usando um writeBatch atômico validado pelas regras de segurança do Firestore
btnBackLobby.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  try {
    const snapJogadores = await getDocs(jogadoresRef);
    const batch = writeBatch(db);

    batch.update(salaRef, {
      status: "aguardando",
      atualizadoEm: serverTimestamp()
    });

    snapJogadores.forEach((docSnap) => {
      if (docSnap.data().pronto !== false) {
        batch.update(docSnap.ref, {
          pronto: false
        });
      }
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, "salas/principal");
  }
});

// ============================================================================
// 13. MODO DEMONSTRAÇÃO (BOTS DE TESTE)
// ============================================================================
const LIMITE_BOTS = 4;
const nomesDeBots = ["Lucas", "Marina", "Rafael", "Camila", "Bruno", "Sofia", "Pedro", "Julia"];

// Atualiza o estado visual dos botões de bot conforme a quantidade na sala
function atualizarBotoesDeBots(quantidadeBots) {
  btnRemoveBots.disabled = quantidadeBots === 0;

  if (quantidadeBots >= LIMITE_BOTS) {
    btnAddBot.disabled = true;
    btnAddBot.textContent = "Limite de bots atingido";
  } else {
    btnAddBot.disabled = false;
    btnAddBot.textContent = "Adicionar bot de teste";
  }
}

// Adiciona um jogador falso (bot: true), respeitando o limite e sem repetir nomes
btnAddBot.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  btnAddBot.disabled = true;

  let botId = "";
  let totalBotsAtuais = Object.values(jogadoresAtuais).filter((j) => j.bot === true).length;

  try {
    // Consulta o banco no momento do clique para evitar ultrapassar o limite ou repetir nome
    const snapJogadores = await getDocs(jogadoresRef);
    const nomesEmUso = new Set();
    let botsNoBanco = 0;

    snapJogadores.forEach((docSnap) => {
      const dados = docSnap.data();
      if (dados.nome) nomesEmUso.add(dados.nome);
      if (dados.bot === true) botsNoBanco++;
    });

    totalBotsAtuais = botsNoBanco;
    if (botsNoBanco >= LIMITE_BOTS) {
      atualizarBotoesDeBots(botsNoBanco);
      return;
    }

    // Sorteia apenas entre os nomes que ainda não estão em uso na sala
    const opcoesLivres = nomesDeBots.filter((n) => !nomesEmUso.has(`${n} (bot)`));
    if (opcoesLivres.length === 0) return;

    const nomeEscolhido = opcoesLivres[Math.floor(Math.random() * opcoesLivres.length)];
    const nomeBot = `${nomeEscolhido} (bot)`;

    botId = "bot_" + Math.random().toString(36).substring(2, 8) + Date.now().toString(36);
    const botRef = doc(db, "salas", "principal", "jogadores", botId);

    // 1) Cria o bot com a mesma estrutura dos jogadores reais + bot: true
    await setDoc(botRef, {
      uid: usuarioAtual.uid,
      nome: nomeBot,
      pronto: false,
      entrouEm: serverTimestamp(),
      ultimoSinal: serverTimestamp(),
      bot: true
    });
    totalBotsAtuais = botsNoBanco + 1;

    // 2) Envia "entrou na sala" apenas uma vez, no momento da criação do bot
    await addDoc(mensagensRef, {
      uid: usuarioAtual.uid,
      tipo: "sistema",
      autor: "Sistema",
      texto: `${nomeBot} entrou na sala`,
      hora: serverTimestamp()
    });

    // 3) Agenda o bot para marcar "pronto" entre 2 e 5 segundos
    agendarBotPendente(botId, nomeBot);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `salas/principal/jogadores/${botId || "bot"}`);
  } finally {
    atualizarBotoesDeBots(totalBotsAtuais);
  }
});

// Verifica no carregamento da página se existe algum bot com pronto: false no banco
async function verificarBotsPendentesAoCarregar() {
  if (!usuarioAtual) return;

  try {
    const snapJogadores = await getDocs(jogadoresRef);
    snapJogadores.forEach((docSnap) => {
      const dados = docSnap.data();
      if (dados.bot === true && dados.pronto === false) {
        agendarBotPendente(docSnap.id, dados.nome || "Bot");
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "salas/principal/jogadores");
  }
}

// Agenda um atraso aleatório de 2 a 5 segundos para marcar um bot como pronto
function agendarBotPendente(botId, nomeBot) {
  if (!usuarioAtual || timersPorBot.has(botId)) return;

  const atrasoMs = 2000 + Math.floor(Math.random() * 3001);
  const timerId = setTimeout(async () => {
    timersPorBot.delete(botId);

    if (!usuarioAtual) return;

    try {
      const botRef = doc(db, "salas", "principal", "jogadores", botId);
      const botSnap = await getDoc(botRef);

      // Só atualiza se o bot ainda existir no banco e continuar em "Aguardando"
      if (!botSnap.exists() || botSnap.data().pronto === true) return;

      const jaAvisou = botSnap.data().avisou === true;

      // Salva avisou: true junto com pronto: true quando ainda não tiver avisado
      if (!jaAvisou) {
        await updateDoc(botRef, {
          pronto: true,
          avisou: true,
          ultimoSinal: serverTimestamp()
        });

        // Envia a mensagem "Estou pronto!" apenas uma única vez para este bot
        await addDoc(mensagensRef, {
          uid: usuarioAtual.uid,
          tipo: "usuario",
          autor: nomeBot,
          texto: "Estou pronto!",
          hora: serverTimestamp()
        });
      } else {
        await updateDoc(botRef, {
          pronto: true,
          ultimoSinal: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `salas/principal/jogadores/${botId}`);
    }
  }, atrasoMs);

  timersPorBot.set(botId, timerId);
}

// Apaga do banco todos os jogadores marcados com bot: true
btnRemoveBots.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  btnRemoveBots.disabled = true;
  limparTimersDeBots();

  try {
    const snapJogadores = await getDocs(jogadoresRef);
    const batch = writeBatch(db);
    let totalRemovidos = 0;

    snapJogadores.forEach((docSnap) => {
      if (docSnap.data().bot === true) {
        batch.delete(docSnap.ref);
        totalRemovidos++;
      }
    });

    if (totalRemovidos > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, "salas/principal/jogadores");
  }
});

// ============================================================================
// 14. LIMPAR CHAT (BOTÃO E REINÍCIO DE SALA VAZIA)
// ============================================================================
// Apaga todas as mensagens de salas/principal/mensagens em lotes seguros
async function apagarTodasAsMensagens() {
  let snapMensagens;
  try {
    snapMensagens = await getDocs(mensagensRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, "salas/principal/mensagens");
  }

  if (!snapMensagens || snapMensagens.empty) return;

  // O Firestore permite até 500 operações por writeBatch; usamos 450 por segurança
  const docs = snapMensagens.docs;
  for (let i = 0; i < docs.length; i += 450) {
    const batch = writeBatch(db);
    docs.slice(i, i + 450).forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "salas/principal/mensagens");
    }
  }
}

// Botão pequeno "Limpar chat": apaga todas as mensagens do banco para todos
btnClearChat.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  btnClearChat.disabled = true;
  await apagarTodasAsMensagens();
});


