const API_URL = 'http://localhost:3000'

const form = document.querySelector('.form-login')
const aviso = document.querySelector('.login-aviso')
const botao = form.querySelector('.btn-login')

// para onde ir depois de entrar: login.html?voltar=produto.html?id=3 volta pro produto.
// Só aceita caminhos relativos, para ninguém usar o link para mandar o usuário a outro site.
function destinoDepoisDoLogin() {
    const voltar = new URLSearchParams(window.location.search).get('voltar')
    if (voltar && !/^[a-z]+:|^\/\//i.test(voltar)) return voltar
    return './perfil.html'
}

function mostrarAviso(texto) {
    aviso.textContent = texto
    aviso.hidden = false
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

form.addEventListener('submit', async (e) => {
    e.preventDefault()
    aviso.hidden = true

    const email = form.email.value.trim()
    const senha = form.senha.value

    if (!email || !senha) {
        mostrarAviso('Informe e-mail e senha.')
        return
    }

    botao.disabled = true
    botao.textContent = 'Entrando...'

    try {
        const resposta = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        })
        const dados = await resposta.json()

        if (!resposta.ok) {
            // ex.: "E-mail ou senha inválidos"
            mostrarAviso(dados.message || 'Não foi possível entrar.')
            return
        }

        localStorage.setItem('token', dados.token)
        localStorage.setItem('usuario', JSON.stringify(dados.usuario))
        window.location.href = destinoDepoisDoLogin()
    } catch (err) {
        console.error(err)
        mostrarAviso('Não foi possível conectar ao servidor.')
    } finally {
        botao.disabled = false
        botao.textContent = 'Entrar'
    }
})
