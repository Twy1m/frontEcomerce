const API_URL = 'http://localhost:3000'

const form = document.querySelector('.form-login')
const aviso = document.querySelector('.login-aviso')
const botao = form.querySelector('.btn-login')

// mesmo "voltar" do login: depois de criar a conta, volta para onde a pessoa estava
const voltar = new URLSearchParams(window.location.search).get('voltar')
const voltarSeguro = voltar && !/^[a-z]+:|^\/\//i.test(voltar) ? voltar : null
const destino = voltarSeguro || './perfil.html'

// o link "Entrar" leva o voltar junto
if (voltarSeguro) {
    form.querySelector('.link-troca').href = `./login.html?voltar=${encodeURIComponent(voltarSeguro)}`
}

if (localStorage.getItem('token')) {
    window.location.replace(destino)
}

function mostrarAviso(texto) {
    aviso.textContent = texto
    aviso.hidden = false
}

// formata o CPF enquanto digita: 12345678901 -> 123.456.789-01
form.cpf.addEventListener('input', () => {
    const n = form.cpf.value.replace(/\D/g, '').slice(0, 11)
    form.cpf.value = n
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2')
})

async function postar(rota, corpo) {
    const resposta = await fetch(`${API_URL}${rota}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.message || 'Algo deu errado')
    return dados
}

form.addEventListener('submit', async (e) => {
    e.preventDefault()
    aviso.hidden = true

    const nome = form.nome.value.trim()
    const email = form.email.value.trim()
    const cpf = form.cpf.value
    const senha = form.senha.value

    // as mesmas regras do backend, para avisar antes de enviar
    if (!nome || !email || !cpf || !senha) return mostrarAviso('Preencha todos os campos.')
    if (cpf.replace(/\D/g, '').length !== 11) return mostrarAviso('O CPF precisa ter 11 dígitos.')
    if (senha.length < 6) return mostrarAviso('A senha precisa ter pelo menos 6 caracteres.')
    if (senha !== form.confirmarSenha.value) return mostrarAviso('As senhas não são iguais.')

    botao.disabled = true
    botao.textContent = 'Criando conta...'

    try {
        await postar('/usuarios', { nome, email, cpf, senha })
    } catch (err) {
        // ex.: "E-mail já cadastrado", "CPF inválido"
        mostrarAviso(err.message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : err.message)
        botao.disabled = false
        botao.textContent = 'Criar conta'
        return
    }

    // conta criada: já entra direto, sem pedir para digitar tudo de novo
    try {
        const { token, usuario } = await postar('/auth/login', { email, senha })
        localStorage.setItem('token', token)
        localStorage.setItem('usuario', JSON.stringify(usuario))
        window.location.href = destino
    } catch {
        // se o login automático falhar, a conta existe: manda para o login normal
        window.location.href = './login.html'
    }
})
