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

// configuração do firebase
const firebaseConfig = {
  apiKey: "AIzaSyCX8b665uBL8zVD12Zu6PHAq8ZRguBkFks",
  authDomain: "sala-de-espera-c3802.firebaseapp.com",
  databaseURL: "https://sala-de-espera-c3802-default-rtdb.firebaseio.com",
  projectId: "sala-de-espera-c3802",
  storageBucket: "sala-de-espera-c3802.firebasestorage.app",
  messagingSenderId: "920680794270",
  appId: "1:920680794270:web:8f2696ab17a841e089538f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const salaRef = ref(db, "salas/principal");
const statusRef = ref(db, "salas/principal/status");
const jogadoresRef = ref(db, "salas/principal/jogadores");
const mensagensRef = ref(db, "salas/principal/mensagens");
const conectadoRef = ref(db, ".info/connected");

const configWarning = document.getElementById("config-warning");
const headerInfo = document.getElementById("header-player-info");
const headerNome = document.getElementById("header-player-name");
const btnSair = document.getElementById("btn-leave-room");

const telaLogin = document.getElementById("screen-login");
const telaSala = document.getElementById("screen-lobby");
const telaPartida = document.getElementById("screen-started");

const authBox = document.getElementById("auth-box");
const authTexto = document.getElementById("auth-status-text");
const btnGoogle = document.getElementById("btn-google-login");

const formLogin = document.getElementById("login-form");
const inputApelido = document.getElementById("nickname-input");
const contadorApelido = document.getElementById("nickname-counter");
const erroLogin = document.getElementById("login-error");
const btnEntrar = document.getElementById("btn-enter");

const contadorJogadores = document.getElementById("players-counter");
const listaJogadoresEl = document.getElementById("players-list");
const btnPronto = document.getElementById("btn-ready");
const btnIniciar = document.getElementById("btn-start");
const dicaIniciar = document.getElementById("start-hint");
const btnAddBot = document.getElementById("btn-add-bot");
const btnRemoverBots = document.getElementById("btn-remove-bots");
const dicaSolo = document.getElementById("demo-solo-tip");

const chatMensagens = document.getElementById("chat-messages");
const formChat = document.getElementById("chat-form");
const inputChat = document.getElementById("chat-input");
const btnLimparChat = document.getElementById("btn-clear-chat");

const listaPartidaEl = document.getElementById("started-players-list");
const btnVoltar = document.getElementById("btn-back-lobby");

// id único por aba
let meuId = sessionStorage.getItem("sala_jogador_id");
if (!meuId) {
  meuId = "jog_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  sessionStorage.setItem("sala_jogador_id", meuId);
}
const meuRef = ref(db, `salas/principal/jogadores/${meuId}`);

const jogadorAtual = {
  uid: "",
  nome: "",
  pronto: false,
  entrouEm: null,
  naSala: false
};

let listaJogadores = {};
let statusSala = "aguardando";
let timerPresenca = null;
let ouvintes = [];
const timersBots = new Map();

const LIMITE_BOTS = 4;
const nomesBots = ["Lucas", "Marina", "Rafael", "Camila", "Bruno", "Sofia", "Pedro", "Julia"];

function mostrarTela(nome) {
  telaLogin.classList.add("hidden");
  telaSala.classList.add("hidden");
  telaPartida.classList.add("hidden");
  if (nome === "login") telaLogin.classList.remove("hidden");
  if (nome === "sala") telaSala.classList.remove("hidden");
  if (nome === "partida") telaPartida.classList.remove("hidden");
}

function formatarHora(ms) {
  if (!ms) return "--:--";
  const d = new Date(Number(ms));
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

inputApelido.addEventListener("input", () => {
  contadorApelido.textContent = `${inputApelido.value.length}/16`;
  erroLogin.classList.add("hidden");
});

async function fazerLoginAnonimo() {
  if (auth.currentUser) return auth.currentUser;
  try {
    const res = await signInAnonymously(auth);
    return res.user;
  } catch (err) {
    console.error(err);
    if (err?.code === "auth/operation-not-allowed" || err?.code === "auth/admin-restricted-operation") {
      authBox.classList.remove("hidden");
      authTexto.textContent = "Ative o login Anônimo no Firebase ou entre com Google:";
      btnGoogle.classList.remove("hidden");
      formLogin.classList.add("hidden");
    } else {
      configWarning.classList.remove("hidden");
    }
    return null;
  }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    jogadorAtual.uid = user.uid;
    authBox.classList.add("hidden");
    formLogin.classList.remove("hidden");
    verificarBots();
  } else {
    jogadorAtual.uid = "";
    fazerLoginAnonimo();
  }
});

btnGoogle.addEventListener("click", async () => {
  btnGoogle.disabled = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    console.error(err);
  } finally {
    btnGoogle.disabled = false;
  }
});

async function regravarJogador(pronto) {
  if (!jogadorAtual.uid || !jogadorAtual.nome) return;
  await onDisconnect(meuRef).remove();
  await set(meuRef, {
    uid: jogadorAtual.uid,
    nome: jogadorAtual.nome,
    pronto: pronto,
    entrouEm: jogadorAtual.entrouEm || serverTimestamp(),
    ultimoSinal: serverTimestamp()
  });
}

async function entrarNaSala(evento) {
  evento.preventDefault();
  const apelido = inputApelido.value.trim().slice(0, 16);
  if (!apelido) {
    erroLogin.textContent = "Digite um apelido antes de entrar.";
    erroLogin.classList.remove("hidden");
    inputApelido.focus();
    return;
  }

  btnEntrar.disabled = true;
  btnEntrar.textContent = "Entrando...";

  try {
    if (!jogadorAtual.uid) {
      const user = await fazerLoginAnonimo();
      if (!user) return;
      jogadorAtual.uid = user.uid;
    }

    jogadorAtual.nome = apelido;
    jogadorAtual.pronto = false;
    jogadorAtual.entrouEm = Date.now();

    await remove(meuRef).catch(() => {});

    const snapJog = await get(jogadoresRef);
    const dadosJog = snapJog.val() || {};
    const agora = Date.now();
    let ativos = 0;
    Object.values(dadosJog).forEach((j) => {
      if (agora - (Number(j.ultimoSinal) || 0) <= 60000 || j.bot === true) ativos++;
    });

    if (ativos === 0) {
      await remove(mensagensRef);
      await update(salaRef, { status: "aguardando", atualizadoEm: serverTimestamp() });
      statusSala = "aguardando";
    } else {
      const snapStatus = await get(statusRef);
      statusSala = snapStatus.val() || "aguardando";
    }

    await regravarJogador(false);
    jogadorAtual.naSala = true;

    await push(mensagensRef, {
      uid: jogadorAtual.uid,
      tipo: "sistema",
      autor: "Sistema",
      texto: `${jogadorAtual.nome} entrou na sala`,
      hora: serverTimestamp()
    });

    iniciarSala();
    headerNome.textContent = jogadorAtual.nome;
    headerInfo.classList.remove("hidden");
    mostrarTela(statusSala === "iniciada" ? "partida" : "sala");
  } catch (err) {
    console.error(err);
    jogadorAtual.naSala = false;
    erroLogin.textContent = "Não foi possível entrar na sala.";
    erroLogin.classList.remove("hidden");
  } finally {
    btnEntrar.disabled = false;
    btnEntrar.textContent = "Entrar na sala";
  }
}

async function sairDaSala() {
  pararSala();
  if (!jogadorAtual.naSala) return;
  jogadorAtual.naSala = false;
  await onDisconnect(meuRef).cancel().catch(() => {});
  await remove(meuRef).catch(() => {});
  headerInfo.classList.add("hidden");
  mostrarTela("login");
}

function pararSala() {
  ouvintes.forEach((unsub) => unsub());
  ouvintes = [];
  clearInterval(timerPresenca);
  timersBots.forEach((id) => clearTimeout(id));
  timersBots.clear();
}

function iniciarSala() {
  pararSala();

  ouvintes.push(
    onValue(conectadoRef, (snap) => {
      if (snap.val() === true && jogadorAtual.naSala) {
        regravarJogador(jogadorAtual.pronto).catch(() => {});
      }
    })
  );

  ouvintes.push(
    onValue(statusRef, (snap) => {
      statusSala = snap.val() || "aguardando";
      if (!jogadorAtual.naSala) return;
      mostrarTela(statusSala === "iniciada" ? "partida" : "sala");
    })
  );

  // pega os jogadores da sala e atualiza a tela
  ouvintes.push(
    onValue(jogadoresRef, (snap) => {
      const brutos = snap.val() || {};
      const ativos = {};
      const agora = Date.now();

      Object.entries(brutos).forEach(([id, j]) => {
        if (!j) return;
        const ultimo = Number(j.ultimoSinal) || agora;
        if (agora - ultimo <= 60000 || id === meuId || j.bot === true) {
          ativos[id] = j;
        }
        if (id === meuId && j.entrouEm) jogadorAtual.entrouEm = j.entrouEm;
        if (j.bot === true && j.pronto === false) agendarBot(id, j.nome || "Bot");
      });

      listaJogadores = ativos;
      desenharJogadores();
    })
  );

  const qMensagens = query(mensagensRef, orderByChild("hora"), limitToLast(60));
  ouvintes.push(
    onValue(qMensagens, (snap) => {
      const msgs = [];
      snap.forEach((c) => {
        msgs.push(c.val());
      });
      desenharChat(msgs);
    })
  );

  timerPresenca = setInterval(async () => {
    if (!jogadorAtual.naSala) return;
    try {
      const snap = await get(meuRef);
      if (snap.exists() && snap.val()?.nome) {
        await update(meuRef, { ultimoSinal: serverTimestamp() });
      } else {
        await regravarJogador(jogadorAtual.pronto);
      }
    } catch {}
  }, 15000);
}

function desenharJogadores() {
  listaJogadoresEl.textContent = "";
  listaPartidaEl.textContent = "";

  const ordenados = Object.entries(listaJogadores).sort(
    (a, b) => (Number(a[1].entrouEm) || 0) - (Number(b[1].entrouEm) || 0)
  );

  let prontos = 0;
  let bots = 0;

  ordenados.forEach(([id, j]) => {
    if (j.bot === true) bots++;
    const pronto = Boolean(j.pronto);
    if (pronto) prontos++;

    if (id === meuId) {
      jogadorAtual.pronto = pronto;
      btnPronto.textContent = pronto ? "Cancelar pronto" : "Estou pronto";
      btnPronto.classList.toggle("btn-primary", !pronto);
      btnPronto.classList.toggle("btn-secondary-ready", pronto);
    }

    const nome = j.nome || (id === meuId && jogadorAtual.nome ? jogadorAtual.nome : "Jogador");

    const li = document.createElement("li");
    li.className = "player-item";

    const wrap = document.createElement("div");
    wrap.className = "player-name-wrap";

    const spanNome = document.createElement("span");
    spanNome.className = "player-name";
    spanNome.textContent = nome;
    wrap.appendChild(spanNome);

    if (id === meuId) {
      const tag = document.createElement("span");
      tag.className = "player-self-tag";
      tag.textContent = "(Você)";
      wrap.appendChild(tag);
    }

    const status = document.createElement("span");
    status.className = pronto ? "player-status is-ready" : "player-status is-waiting";
    status.textContent = pronto ? "Pronto" : "Aguardando";

    li.appendChild(wrap);
    li.appendChild(status);
    listaJogadoresEl.appendChild(li);

    const liPartida = document.createElement("li");
    liPartida.textContent = id === meuId ? `${nome} (Você)` : nome;
    listaPartidaEl.appendChild(liPartida);
  });

  const total = ordenados.length;
  btnRemoverBots.disabled = bots === 0;
  btnAddBot.disabled = bots >= LIMITE_BOTS;
  btnAddBot.textContent = bots >= LIMITE_BOTS ? "Limite de bots atingido" : "Adicionar bot de teste";

  dicaSolo.classList.toggle("hidden", !(total === 1 && bots === 0));
  contadorJogadores.textContent = `${total} ${total === 1 ? "jogador na sala" : "jogadores na sala"} · ${prontos} pronto(s)`;

  const podeIniciar = total >= 2 && prontos === total;
  btnIniciar.disabled = !podeIniciar;
  if (total < 2) {
    dicaIniciar.textContent = "Precisa de pelo menos 2 jogadores prontos.";
  } else if (!podeIniciar) {
    dicaIniciar.textContent = "Esperando todos ficarem prontos.";
  } else {
    dicaIniciar.textContent = "Todos prontos!";
  }
}

function desenharChat(mensagens) {
  chatMensagens.textContent = "";
  btnLimparChat.disabled = mensagens.length === 0;

  if (mensagens.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "chat-empty";
    vazio.textContent = "Nenhuma mensagem ainda.";
    chatMensagens.appendChild(vazio);
    return;
  }

  mensagens.forEach((msg) => {
    if (msg.tipo === "sistema") {
      const div = document.createElement("div");
      div.className = "chat-system";
      const txt = document.createElement("span");
      txt.textContent = msg.texto || "";
      const hora = document.createElement("span");
      hora.className = "chat-time";
      hora.textContent = formatarHora(msg.hora);
      div.appendChild(txt);
      div.appendChild(hora);
      chatMensagens.appendChild(div);
    } else {
      const box = document.createElement("div");
      box.className = "chat-message";
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
      box.appendChild(meta);
      box.appendChild(corpo);
      chatMensagens.appendChild(box);
    }
  });

  chatMensagens.scrollTop = chatMensagens.scrollHeight;
}

async function marcarPronto() {
  if (!jogadorAtual.naSala) return;
  const novoPronto = !jogadorAtual.pronto;
  try {
    const snap = await get(meuRef);
    if (snap.exists() && snap.val()?.nome) {
      await update(meuRef, { pronto: novoPronto, ultimoSinal: serverTimestamp() });
    } else {
      await regravarJogador(novoPronto);
    }
  } catch (err) {
    console.error(err);
  }
}

async function enviarMensagem(evento) {
  evento.preventDefault();
  if (!jogadorAtual.naSala) return;
  const texto = inputChat.value.trim().slice(0, 200);
  if (!texto) return;
  inputChat.value = "";
  await push(mensagensRef, {
    uid: jogadorAtual.uid,
    tipo: "usuario",
    autor: jogadorAtual.nome,
    texto,
    hora: serverTimestamp()
  });
}

async function iniciarPartida() {
  if (!jogadorAtual.naSala || btnIniciar.disabled) return;
  await update(salaRef, { status: "iniciada", atualizadoEm: serverTimestamp() });
}

async function voltarParaSala() {
  if (!jogadorAtual.naSala) return;
  const snap = await get(jogadoresRef);
  const dados = snap.val() || {};
  const updates = { status: "aguardando", atualizadoEm: serverTimestamp() };

  Object.keys(dados).forEach((id) => {
    if (id === meuId && !dados[id]?.nome) {
      updates[`jogadores/${meuId}`] = {
        uid: jogadorAtual.uid,
        nome: jogadorAtual.nome,
        pronto: false,
        entrouEm: jogadorAtual.entrouEm || serverTimestamp(),
        ultimoSinal: serverTimestamp()
      };
    } else if (dados[id]?.nome && dados[id]?.pronto !== false) {
      updates[`jogadores/${id}/pronto`] = false;
    }
  });

  if (!dados[meuId]) {
    updates[`jogadores/${meuId}`] = {
      uid: jogadorAtual.uid,
      nome: jogadorAtual.nome,
      pronto: false,
      entrouEm: jogadorAtual.entrouEm || serverTimestamp(),
      ultimoSinal: serverTimestamp()
    };
  }

  await update(salaRef, updates);
}

async function limparChat() {
  if (!jogadorAtual.naSala) return;
  btnLimparChat.disabled = true;
  await remove(mensagensRef);
}

// bots de teste
async function adicionarBot() {
  if (!jogadorAtual.naSala) return;
  btnAddBot.disabled = true;

  try {
    const snap = await get(jogadoresRef);
    const dados = snap.val() || {};
    const usados = new Set();
    let bots = 0;

    Object.values(dados).forEach((j) => {
      if (j?.nome) usados.add(j.nome);
      if (j?.bot === true) bots++;
    });

    if (bots >= LIMITE_BOTS) return;

    const livres = nomesBots.filter((n) => !usados.has(`${n} (bot)`));
    if (livres.length === 0) return;

    const nomeBot = `${livres[Math.floor(Math.random() * livres.length)]} (bot)`;
    const botId = "bot_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);

    await set(ref(db, `salas/principal/jogadores/${botId}`), {
      uid: jogadorAtual.uid,
      nome: nomeBot,
      pronto: false,
      entrouEm: serverTimestamp(),
      ultimoSinal: serverTimestamp(),
      bot: true
    });

    await push(mensagensRef, {
      uid: jogadorAtual.uid,
      tipo: "sistema",
      autor: "Sistema",
      texto: `${nomeBot} entrou na sala`,
      hora: serverTimestamp()
    });

    agendarBot(botId, nomeBot);
  } catch (err) {
    console.error(err);
  } finally {
    const qtd = Object.values(listaJogadores).filter((j) => j.bot === true).length;
    btnAddBot.disabled = qtd >= LIMITE_BOTS;
  }
}

async function verificarBots() {
  if (!jogadorAtual.uid) return;
  try {
    const snap = await get(jogadoresRef);
    const dados = snap.val() || {};
    Object.entries(dados).forEach(([id, j]) => {
      if (j?.bot === true && j?.pronto === false) agendarBot(id, j.nome || "Bot");
    });
  } catch {}
}

function agendarBot(botId, nomeBot) {
  if (!jogadorAtual.uid || timersBots.has(botId)) return;
  const atraso = 2000 + Math.floor(Math.random() * 3001);

  const timer = setTimeout(async () => {
    timersBots.delete(botId);
    if (!jogadorAtual.uid) return;

    try {
      const botRef = ref(db, `salas/principal/jogadores/${botId}`);
      const snap = await get(botRef);
      const bot = snap.val();
      if (!bot || bot.pronto === true) return;

      if (bot.avisou !== true) {
        await update(botRef, { pronto: true, avisou: true, ultimoSinal: serverTimestamp() });
        await push(mensagensRef, {
          uid: jogadorAtual.uid,
          tipo: "usuario",
          autor: nomeBot,
          texto: "Estou pronto!",
          hora: serverTimestamp()
        });
      } else {
        await update(botRef, { pronto: true, ultimoSinal: serverTimestamp() });
      }
    } catch {}
  }, atraso);

  timersBots.set(botId, timer);
}

async function removerBots() {
  if (!jogadorAtual.naSala) return;
  btnRemoverBots.disabled = true;
  timersBots.forEach((id) => clearTimeout(id));
  timersBots.clear();

  const snap = await get(jogadoresRef);
  const dados = snap.val() || {};
  const remocoes = {};
  Object.entries(dados).forEach(([id, j]) => {
    if (j?.bot === true) remocoes[id] = null;
  });
  if (Object.keys(remocoes).length > 0) await update(jogadoresRef, remocoes);
}

formLogin.addEventListener("submit", entrarNaSala);
btnSair.addEventListener("click", sairDaSala);
btnPronto.addEventListener("click", marcarPronto);
formChat.addEventListener("submit", enviarMensagem);
btnLimparChat.addEventListener("click", limparChat);
btnIniciar.addEventListener("click", iniciarPartida);
btnVoltar.addEventListener("click", voltarParaSala);
btnAddBot.addEventListener("click", adicionarBot);
btnRemoverBots.addEventListener("click", removerBots);
