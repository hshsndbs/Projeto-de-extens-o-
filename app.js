// ============================================================================
// 1. IMPORTAÇÃO DO FIREBASE (SDK MODULAR VIA CDN DO GSTATIC)
// ============================================================================
// Usamos apenas Firebase Auth (login anônimo) e Firebase Realtime Database
// diretamente via CDN oficial do Google, sem React e sem etapa de build.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  onValue,
  onDisconnect,
  query,
  orderByChild,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

// ============================================================================
// 2. CONFIGURAÇÃO DO FIREBASE (COM databaseURL DO REALTIME DATABASE)
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCX8b665uBL8zVD12Zu6PHAq8ZRguBkFks",
  authDomain: "sala-de-espera-c3802.firebaseapp.com",
  databaseURL: "https://sala-de-espera-c3802-default-rtdb.firebaseio.com",
  projectId: "sala-de-espera-c3802",
  storageBucket: "sala-de-espera-c3802.firebasestorage.app",
  messagingSenderId: "920680794270",
  appId: "1:920680794270:web:8f2696ab17a841e089538f"
};

// ============================================================================
// 3. TRATAMENTO ESTRUTURADO DE ERROS DO REALTIME DATABASE
// ============================================================================
function handleDatabaseError(error, operacao, caminho) {
  const user = auth ? auth.currentUser : null;
  const infoErro = {
    error: error instanceof Error ? error.message : String(error),
    operacao,
    caminho,
    uid: user?.uid || null,
    isAnonymous: user?.isAnonymous ?? null
  };
  console.error("Realtime Database Error:", JSON.stringify(infoErro));
  throw new Error(JSON.stringify(infoErro));
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

// Elementos de autenticação (aviso/fallback se anônimo estiver desativado)
const authBox = document.getElementById("auth-box");
const authStatusText = document.getElementById("auth-status-text");
const btnGoogleLogin = document.getElementById("btn-google-login");

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
// no mesmo computador para testar, cada aba representa um jogador diferente.
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
let estouNaSala = false;
let estouPronto = false;
let jogadoresAtuais = {};
let statusAtualDaSala = "aguardando";

// Controladores dos ouvintes em tempo real e heartbeat de presença
let unsubConexao = null;
let unsubSala = null;
let unsubJogadores = null;
let unsubMensagens = null;
let intervaloPresenca = null;
// Mapa de temporizadores ativos por bot (evita agendar o mesmo bot duas vezes)
const timersPorBot = new Map();

// ============================================================================
// 6. INICIALIZAÇÃO DO FIREBASE (AUTH ANÔNIMO + REALTIME DATABASE)
// ============================================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// Caminhos no Realtime Database:
// salas/principal
// salas/principal/jogadores/{id}
// salas/principal/mensagens/{id}
const salaRef = ref(db, "salas/principal");
const statusRef = ref(db, "salas/principal/status");
const jogadoresRef = ref(db, "salas/principal/jogadores");
const meuJogadorRef = ref(db, `salas/principal/jogadores/${meuId}`);
const mensagensRef = ref(db, "salas/principal/mensagens");
const conectadoRef = ref(db, ".info/connected");

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

function formatarHora(timestampMs) {
  if (!timestampMs) return "--:--";
  const data = new Date(Number(timestampMs));
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

nicknameInput.addEventListener("input", () => {
  nicknameCounter.textContent = `${nicknameInput.value.length}/16`;
  loginError.classList.add("hidden");
});

// ============================================================================
// 8. AUTENTICAÇÃO ANÔNIMA AUTOMÁTICA DO FIREBASE AUTH
// ============================================================================
// Garante que exista um usuário autenticado (anônimo por padrão) antes de
// ler ou gravar no Realtime Database.
async function garantirLoginAnonimo() {
  if (auth.currentUser) return auth.currentUser;

  try {
    const credencial = await signInAnonymously(auth);
    authBox.classList.add("hidden");
    loginForm.classList.remove("hidden");
    return credencial.user;
  } catch (erro) {
    console.error("Erro no login anônimo:", erro);
    if (
      erro?.code === "auth/operation-not-allowed" ||
      erro?.code === "auth/admin-restricted-operation"
    ) {
      authBox.classList.remove("hidden");
      authStatusText.textContent =
        "Ative o login Anônimo no Firebase Console (Authentication -> Sign-in method) ou entre com Google:";
      btnGoogleLogin.classList.remove("hidden");
      loginForm.classList.add("hidden");
    } else {
      configWarning.classList.remove("hidden");
    }
    return null;
  }
}

onAuthStateChanged(auth, (user) => {
  usuarioAtual = user;

  if (user) {
    authBox.classList.add("hidden");
    loginForm.classList.remove("hidden");
    // Ao carregar a página já autenticado, verifica bots com pronto: false
    verificarBotsPendentesAoCarregar();
  } else {
    garantirLoginAnonimo();
  }
});

btnGoogleLogin.addEventListener("click", async () => {
  btnGoogleLogin.disabled = true;
  btnGoogleLogin.textContent = "Conectando...";
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (erro) {
    console.error("Erro no login Google:", erro);
    authStatusText.textContent = "Não foi possível entrar com Google. Tente novamente.";
  } finally {
    btnGoogleLogin.disabled = false;
    btnGoogleLogin.textContent = "Entrar com Google";
  }
});

// ============================================================================
// 9. ENTRAR NA SALA, REINICIAR SE VAZIA E CONFIGURAR onDisconnect
// ============================================================================
loginForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();

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
    // Garante que o login anônimo já foi concluído antes de acessar o banco
    if (!usuarioAtual) {
      usuarioAtual = await garantirLoginAnonimo();
      if (!usuarioAtual) return;
    }

    meuNome = apelido;

    // Remove eventual registro residual desta aba antes de checar se a sala está vazia
    await remove(meuJogadorRef).catch(() => {});

    // Verifica quantos jogadores ativos já estão em salas/principal/jogadores
    let snapJogadoresAntes;
    try {
      snapJogadoresAntes = await get(jogadoresRef);
    } catch (erro) {
      handleDatabaseError(erro, "get", "salas/principal/jogadores");
    }

    const dadosAntes = snapJogadoresAntes.val() || {};
    const agora = Date.now();
    let jogadoresAtivos = 0;

    Object.values(dadosAntes).forEach((dados) => {
      const ultimo = Number(dados.ultimoSinal) || 0;
      if (agora - ultimo <= 60000 || dados.bot === true) {
        jogadoresAtivos++;
      }
    });

    // Se a sala estiver vazia (este jogador é o primeiro), apaga todas as
    // mensagens do chat e garante o status "aguardando" antes de registrá-lo
    if (jogadoresAtivos === 0) {
      try {
        await remove(mensagensRef);
      } catch (erro) {
        handleDatabaseError(erro, "remove", "salas/principal/mensagens");
      }

      try {
        await update(salaRef, {
          status: "aguardando",
          atualizadoEm: serverTimestamp()
        });
        statusAtualDaSala = "aguardando";
      } catch (erro) {
        handleDatabaseError(erro, "update", "salas/principal");
      }
    } else {
      // Lê o status atual da sala caso já existam jogadores
      try {
        const snapStatus = await get(statusRef);
        statusAtualDaSala = snapStatus.val() || "aguardando";
      } catch (erro) {
        handleDatabaseError(erro, "get", "salas/principal/status");
      }
    }

    // Configura onDisconnect para remover o jogador real se fechar a aba
    await onDisconnect(meuJogadorRef).remove();

    // Registra o jogador em salas/principal/jogadores/{id}
    try {
      await set(meuJogadorRef, {
        uid: usuarioAtual.uid,
        nome: meuNome,
        pronto: false,
        entrouEm: serverTimestamp(),
        ultimoSinal: serverTimestamp()
      });
    } catch (erro) {
      handleDatabaseError(erro, "set", `salas/principal/jogadores/${meuId}`);
    }

    estouNaSala = true;
    estouPronto = false;

    // Envia mensagem de sistema informando que o jogador entrou na sala
    try {
      await push(mensagensRef, {
        uid: usuarioAtual.uid,
        tipo: "sistema",
        autor: "Sistema",
        texto: `${meuNome} entrou na sala`,
        hora: serverTimestamp()
      });
    } catch (erro) {
      handleDatabaseError(erro, "push", "salas/principal/mensagens");
    }

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
    loginError.textContent =
      "Não foi possível conectar ao Realtime Database. Verifique a databaseURL e as regras.";
    loginError.classList.remove("hidden");
  } finally {
    btnEnter.disabled = false;
    btnEnter.textContent = "Entrar na sala";
  }
});

// Botão "Sair da sala": remove o jogador e volta para a tela de login
async function sairDaSala() {
  pararObservadores();
  if (!estouNaSala) return;

  estouNaSala = false;
  try {
    await onDisconnect(meuJogadorRef).cancel();
    await remove(meuJogadorRef);
  } catch (erro) {
    handleDatabaseError(erro, "remove", `salas/principal/jogadores/${meuId}`);
  }

  headerPlayerInfo.classList.add("hidden");
  mostrarTela("login");
}

btnLeaveRoom.addEventListener("click", () => {
  sairDaSala();
});

// Atualiza o campo ultimoSinal a cada 15 segundos enquanto a aba estiver aberta
function iniciarHeartbeatDePresenca() {
  if (intervaloPresenca) clearInterval(intervaloPresenca);
  intervaloPresenca = setInterval(async () => {
    if (!estouNaSala || !usuarioAtual) return;
    try {
      await update(meuJogadorRef, {
        ultimoSinal: serverTimestamp()
      });
    } catch {
      // Ignora falhas transitórias de rede
    }
  }, 15000);
}

// ============================================================================
// 10. OBSERVADORES EM TEMPO REAL (onValue)
// ============================================================================
function pararObservadores() {
  if (unsubConexao) {
    unsubConexao();
    unsubConexao = null;
  }
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

  // 10A. Monitora .info/connected para rearmar o onDisconnect se a conexão voltar
  unsubConexao = onValue(conectadoRef, (snapshot) => {
    const conectado = snapshot.val() === true;
    if (conectado && estouNaSala) {
      onDisconnect(meuJogadorRef).remove();
    }
  });

  // 10B. Observa o status da sala em salas/principal/status
  unsubSala = onValue(
    statusRef,
    (snapshot) => {
      statusAtualDaSala = snapshot.val() || "aguardando";
      if (!estouNaSala) return;

      if (statusAtualDaSala === "iniciada") {
        mostrarTela("started");
      } else {
        mostrarTela("lobby");
      }
    },
    (erro) => {
      handleDatabaseError(erro, "onValue", "salas/principal/status");
    }
  );

  // 10C. Observa a lista de jogadores em salas/principal/jogadores
  unsubJogadores = onValue(
    jogadoresRef,
    (snapshot) => {
      const dadosBrutos = snapshot.val() || {};
      const mapa = {};
      const agora = Date.now();

      Object.entries(dadosBrutos).forEach(([id, dados]) => {
        if (!dados) return;
        const ultimo = Number(dados.ultimoSinal) || agora;

        // Mantém jogadores ativos, a própria aba e os bots do modo demonstração
        if (agora - ultimo <= 60000 || id === meuId || dados.bot === true) {
          mapa[id] = dados;
        }

        // Se algum bot ainda estiver com pronto: false, agenda sua confirmação automática
        if (dados.bot === true && dados.pronto === false) {
          agendarBotPendente(id, dados.nome || "Bot");
        }
      });

      jogadoresAtuais = mapa;
      renderizarListaDeJogadores(jogadoresAtuais);
    },
    (erro) => {
      handleDatabaseError(erro, "onValue", "salas/principal/jogadores");
    }
  );

  // 10D. Observa as últimas 60 mensagens do chat ordenadas por horário
  const consultaMensagens = query(mensagensRef, orderByChild("hora"), limitToLast(60));
  unsubMensagens = onValue(
    consultaMensagens,
    (snapshot) => {
      const lista = [];
      snapshot.forEach((childSnap) => {
        lista.push(childSnap.val());
      });
      renderizarChat(lista);
    },
    (erro) => {
      handleDatabaseError(erro, "onValue", "salas/principal/mensagens");
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
    const tempoA = Number(a[1].entrouEm) || 0;
    const tempoB = Number(b[1].entrouEm) || 0;
    return tempoA - tempoB;
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

  // Atualiza os botões do modo demonstração (limite de 4 bots)
  atualizarBotoesDeBots(quantidadeBots);

  // Mostra a dica quando houver apenas 1 jogador e nenhum bot na sala
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
    await update(meuJogadorRef, {
      pronto: !estouPronto,
      ultimoSinal: serverTimestamp()
    });
  } catch (erro) {
    handleDatabaseError(erro, "update", `salas/principal/jogadores/${meuId}`);
  }
});

chatForm.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!estouNaSala || !usuarioAtual) return;

  const texto = chatInput.value.trim().slice(0, 200);
  if (!texto) return;

  chatInput.value = "";

  try {
    await push(mensagensRef, {
      uid: usuarioAtual.uid,
      tipo: "usuario",
      autor: meuNome,
      texto: texto,
      hora: serverTimestamp()
    });
  } catch (erro) {
    handleDatabaseError(erro, "push", "salas/principal/mensagens");
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
    await update(salaRef, {
      status: "iniciada",
      atualizadoEm: serverTimestamp()
    });
  } catch (erro) {
    handleDatabaseError(erro, "update", "salas/principal");
  }
});

// Botão "Voltar para a sala": zera o "pronto" de todos e volta para "aguardando"
// usando um update em lote na raiz de salas/principal
btnBackLobby.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  try {
    const snapJogadores = await get(jogadoresRef);
    const dadosJogadores = snapJogadores.val() || {};

    const atualizacoes = {
      status: "aguardando",
      atualizadoEm: serverTimestamp()
    };

    Object.keys(dadosJogadores).forEach((id) => {
      if (dadosJogadores[id]?.pronto !== false) {
        atualizacoes[`jogadores/${id}/pronto`] = false;
      }
    });

    await update(salaRef, atualizacoes);
  } catch (erro) {
    handleDatabaseError(erro, "update", "salas/principal");
  }
});

// ============================================================================
// 13. MODO DEMONSTRAÇÃO (BOTS DE TESTE)
// ============================================================================
const LIMITE_BOTS = 4;
const nomesDeBots = ["Lucas", "Marina", "Rafael", "Camila", "Bruno", "Sofia", "Pedro", "Julia"];

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

// Adiciona um jogador simulado (bot: true), respeitando o limite e sem repetir nomes
btnAddBot.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  btnAddBot.disabled = true;

  let botId = "";
  let totalBotsAtuais = Object.values(jogadoresAtuais).filter((j) => j.bot === true).length;

  try {
    const snapJogadores = await get(jogadoresRef);
    const dadosJogadores = snapJogadores.val() || {};
    const nomesEmUso = new Set();
    let botsNoBanco = 0;

    Object.values(dadosJogadores).forEach((dados) => {
      if (dados?.nome) nomesEmUso.add(dados.nome);
      if (dados?.bot === true) botsNoBanco++;
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
    const botRef = ref(db, `salas/principal/jogadores/${botId}`);

    // 1) Cria o bot com a mesma estrutura dos jogadores reais + bot: true
    await set(botRef, {
      uid: usuarioAtual.uid,
      nome: nomeBot,
      pronto: false,
      entrouEm: serverTimestamp(),
      ultimoSinal: serverTimestamp(),
      bot: true
    });
    totalBotsAtuais = botsNoBanco + 1;

    // 2) Envia "entrou na sala" apenas uma vez, na criação do bot
    await push(mensagensRef, {
      uid: usuarioAtual.uid,
      tipo: "sistema",
      autor: "Sistema",
      texto: `${nomeBot} entrou na sala`,
      hora: serverTimestamp()
    });

    // 3) Agenda o bot para marcar "pronto" entre 2 e 5 segundos
    agendarBotPendente(botId, nomeBot);
  } catch (erro) {
    handleDatabaseError(erro, "set", `salas/principal/jogadores/${botId || "bot"}`);
  } finally {
    atualizarBotoesDeBots(totalBotsAtuais);
  }
});

// Verifica no carregamento da página se existe algum bot com pronto: false no banco
async function verificarBotsPendentesAoCarregar() {
  if (!usuarioAtual) return;

  try {
    const snapJogadores = await get(jogadoresRef);
    const dadosJogadores = snapJogadores.val() || {};

    Object.entries(dadosJogadores).forEach(([id, dados]) => {
      if (dados?.bot === true && dados?.pronto === false) {
        agendarBotPendente(id, dados.nome || "Bot");
      }
    });
  } catch (erro) {
    handleDatabaseError(erro, "get", "salas/principal/jogadores");
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
      const botRef = ref(db, `salas/principal/jogadores/${botId}`);
      const botSnap = await get(botRef);
      const dadosBot = botSnap.val();

      // Só atualiza se o bot ainda existir no banco e continuar em "Aguardando"
      if (!dadosBot || dadosBot.pronto === true) return;

      const jaAvisou = dadosBot.avisou === true;

      if (!jaAvisou) {
        // Salva avisou: true junto com pronto: true e envia "Estou pronto!" só 1 vez
        await update(botRef, {
          pronto: true,
          avisou: true,
          ultimoSinal: serverTimestamp()
        });

        await push(mensagensRef, {
          uid: usuarioAtual.uid,
          tipo: "usuario",
          autor: nomeBot,
          texto: "Estou pronto!",
          hora: serverTimestamp()
        });
      } else {
        await update(botRef, {
          pronto: true,
          ultimoSinal: serverTimestamp()
        });
      }
    } catch (erro) {
      handleDatabaseError(erro, "update", `salas/principal/jogadores/${botId}`);
    }
  }, atrasoMs);

  timersPorBot.set(botId, timerId);
}

// Remove do banco todos os jogadores marcados com bot: true
btnRemoveBots.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  btnRemoveBots.disabled = true;
  limparTimersDeBots();

  try {
    const snapJogadores = await get(jogadoresRef);
    const dadosJogadores = snapJogadores.val() || {};
    const remocoes = {};

    Object.entries(dadosJogadores).forEach(([id, dados]) => {
      if (dados?.bot === true) {
        remocoes[id] = null;
      }
    });

    if (Object.keys(remocoes).length > 0) {
      await update(jogadoresRef, remocoes);
    }
  } catch (erro) {
    handleDatabaseError(erro, "update", "salas/principal/jogadores");
  }
});

// ============================================================================
// 14. LIMPAR CHAT
// ============================================================================
// Botão pequeno "Limpar chat": apaga todas as mensagens do banco para todos
btnClearChat.addEventListener("click", async () => {
  if (!estouNaSala || !usuarioAtual) return;

  btnClearChat.disabled = true;
  try {
    await remove(mensagensRef);
  } catch (erro) {
    handleDatabaseError(erro, "remove", "salas/principal/mensagens");
  }
});
