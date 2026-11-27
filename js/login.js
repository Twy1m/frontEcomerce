const API_URL = 'http://localhost:3000'

// 1ª etapa: e-mail e senha
const form = document.querySelector('.form-login:not(.form-codigo)')
const aviso = form.querySelector('.login-aviso')
const botao = form.querySelector('.btn-login')

// 2ª etapa (só admin): código enviado por e-mail
const formCodigo = document.querySelector('.form-codigo')
const avisoCodigo = formCodigo.querySelector('.codigo-aviso')
const botaoCodigo = formCodigo.querySelector('.btn-login')
const campoCodigo = formCodigo.elements.codigo
const btnReenviar = formCodigo.querySelector('.btn-reenviar')
const btnVoltar = formCodigo.querySelector('.btn-voltar-login')
const emailMascarado = formCodigo.querySelector('.codigo-email')

// para onde ir depois de entrar: login.html?voltar=produto.html?id=3 volta pro produto.
// Só aceita caminhos relativos, para ninguém usar o link para mandar o usuário a outro site.
function destinoDepoisDoLogin() {
    const voltar = new URLSearchParams(window.location.search).get('voltar')
    if (voltar && !/^[a-z]+:|^\/\//i.test(voltar)) return voltar
    return './perfil.html'
}

function mostrarAviso(el, texto, tipo = 'erro') {
    el.textContent = texto
    el.classList.toggle('sucesso', tipo === 'sucesso')
    el.hidden = false
}

// o link "Criar conta" leva o voltar junto
const voltar = new URLSearchParams(window.location.search).get('voltar')
if (voltar) {
    form.querySelector('.link-troca').href = `./cadastro.html?voltar=${encodeURIComponent(voltar)}`
}

// já está logado: não precisa ver o formulário
if (localStorage.getItem('token')) {
    window.location.replace(destinoDepoisDoLogin())
}

async function postar(rota, corpo) {
    const resposta = await fetch(`${API_URL}${rota}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
    })
    const dados = await resposta.json().catch(() => ({}))
    return { ok: resposta.ok, status: resposta.status, dados }
}

function entrar({ token, usuario }) {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    // admin vai para o painel, a não ser que tenha vindo de outra página (?voltar=...)
    const temVoltar = new URLSearchParams(window.location.search).has('voltar')
    window.location.href = usuario.tipo === 'admin' && !temVoltar ? './admin.html' : destinoDepoisDoLogin()
}

// ---------- 1ª etapa ----------

form.addEventListener('submit', async (e) => {
    e.preventDefault()
    aviso.hidden = true

    const email = form.elements.email.value.trim()
    const senha = form.elements.senha.value

    if (!email || !senha) {
        mostrarAviso(aviso, 'Informe e-mail e senha.')
        return
    }

    botao.disabled = true
    botao.textContent = 'Entrando...'

    try {
        const { ok, dados } = await postar('/auth/login', { email, senha })

        if (!ok) {
            // ex.: "E-mail ou senha inválidos", "Muitas tentativas de login..."
            mostrarAviso(aviso, dados.message || 'Não foi possível entrar.')
            return
        }

        // admin: senha certa, agora falta o código do e-mail
        if (dados.precisaCodigo) {
            abrirEtapaCodigo(dados)
            return
        }

        entrar(dados)
    } catch (err) {
        console.error(err)
        mostrarAviso(aviso, 'Não foi possível conectar ao servidor.')
    } finally {
        botao.disabled = false
        botao.textContent = 'Entrar'
    }
})

// ---------- 2ª etapa ----------

let desafio = null
let timerReenvio = null

function abrirEtapaCodigo({ desafio: novoDesafio, email, reenviarEm }) {
    desafio = novoDesafio
    emailMascarado.textContent = email
    form.hidden = true
    formCodigo.hidden = false
    avisoCodigo.hidden = true
    campoCodigo.value = ''
    contarReenvio(reenviarEm)
    campoCodigo.focus()
}

function voltarParaSenha(mensagem) {
    clearInterval(timerReenvio)
    desafio = null
    formCodigo.hidden = true
    form.hidden = false
    form.elements.senha.value = ''
    if (mensagem) mostrarAviso(aviso, mensagem)
    form.elements.senha.focus()
}

// "Reenviar código (42s)" até poder pedir de novo
function contarReenvio(segundos = 60) {
    clearInterval(timerReenvio)
    let restante = Math.max(Number(segundos) || 0, 0)

    const atualizar = () => {
        if (restante <= 0) {
            clearInterval(timerReenvio)
            btnReenviar.disabled = false
            btnReenviar.textContent = 'Reenviar código'
            return
        }
        btnReenviar.disabled = true
        btnReenviar.textContent = `Reenviar código (${restante}s)`
        restante--
    }
    atualizar()
    timerReenvio = setInterval(atualizar, 1000)
}

// só números, no máximo 6 (colar "123 456" também funciona)
campoCodigo.addEventListener('input', () => {
    campoCodigo.value = campoCodigo.value.replace(/\D/g, '').slice(0, 6)
    // completou os 6: já envia
    if (campoCodigo.value.length === 6 && !botaoCodigo.disabled) formCodigo.requestSubmit?.()
})

formCodigo.addEventListener('submit', async (e) => {
    e.preventDefault()
    avisoCodigo.hidden = true

    const codigo = campoCodigo.value
    if (!/^\d{6}$/.test(codigo)) {
        mostrarAviso(avisoCodigo, 'Digite os 6 números do código.')
        campoCodigo.focus()
        return
    }

    botaoCodigo.disabled = true
    botaoCodigo.textContent = 'Confirmando...'

    try {
        const { ok, status, dados } = await postar('/auth/login/verificar', { desafio, codigo })

        if (ok) return entrar(dados)

        // desafio vencido (passou dos 10 minutos): volta para o e-mail e senha
        if (status === 401) return voltarParaSenha(dados.message || 'Sua verificação expirou. Entre de novo.')

        // código errado (400) ou tentativas esgotadas (429): fica aqui para digitar ou reenviar
        mostrarAviso(avisoCodigo, dados.message || 'Não foi possível confirmar o código.')
        campoCodigo.select()
    } catch (err) {
        console.error(err)
        mostrarAviso(avisoCodigo, 'Não foi possível conectar ao servidor.')
    } finally {
        botaoCodigo.disabled = false
        botaoCodigo.textContent = 'Confirmar'
    }
})

btnReenviar.addEventListener('click', async () => {
    btnReenviar.disabled = true
    btnReenviar.textContent = 'Enviando...'
    avisoCodigo.hidden = true

    try {
        const { ok, status, dados } = await postar('/auth/login/reenviar', { desafio })

        if (ok) {
            desafio = dados.desafio
            emailMascarado.textContent = dados.email
            campoCodigo.value = ''
            mostrarAviso(avisoCodigo, 'Enviamos um código novo. O anterior não vale mais.', 'sucesso')
            contarReenvio(dados.reenviarEm)
            campoCodigo.focus()
            return
        }

        if (status === 401) return voltarParaSenha(dados.message)

        mostrarAviso(avisoCodigo, dados.message || 'Não foi possível reenviar o código.')
        // "Aguarde 42 segundo(s)": usa o número da mensagem para a contagem
        const espera = Number(/(\d+) segundo/.exec(dados.message || '')?.[1])
        contarReenvio(espera || 0)
    } catch (err) {
        console.error(err)
        mostrarAviso(avisoCodigo, 'Não foi possível conectar ao servidor.')
        contarReenvio(0)
    }
})

btnVoltar.addEventListener('click', () => voltarParaSenha())
