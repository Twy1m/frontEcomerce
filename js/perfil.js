const API_URL = 'http://localhost:3000'

const irParaLogin = () =>
    window.location.replace(`./login.html?voltar=${encodeURIComponent('perfil.html')}`)

// sem token nem carrega a página: vai direto para o login
if (!localStorage.getItem('token')) irParaLogin()

const ESTADOS = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
    'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]

const STATUS_PEDIDO = {
    PENDENTE: 'Pendente',
    PAGO: 'Pago',
    ENVIADO: 'Enviado',
    ENTREGUE: 'Entregue',
    CANCELADO: 'Cancelado'
}

const conteudoDados = document.querySelector('.perfil-conteudo')
const listaEnderecos = document.querySelector('.enderecos-lista')
const lugarForm = document.querySelector('#form-endereco-lugar')
const btnNovoEndereco = document.querySelector('#btn-novo-endereco')
const avisoEnderecos = document.querySelector('#aviso-enderecos')
const listaPedidos = document.querySelector('.pedidos-lista')
const avisoPedidos = document.querySelector('#aviso-pedidos')

// ---------- utilidades ----------

function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined) el.textContent = texto
    return el
}

function criarBotao(texto, classe = 'btn-secundario') {
    const botao = criarElemento('button', classe, texto)
    botao.type = 'button'
    return botao
}

const formatarPreco = (valor) =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatarData = (iso) =>
    new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const formatarCep = (cep) => String(cep).replace(/^(\d{5})(\d{3})$/, '$1-$2')

function avisar(el, texto, tipo = 'erro') {
    el.textContent = texto
    el.className = `perfil-aviso ${tipo}`
    el.hidden = false
}

// fetch com token; 401 manda para o login (o carrinho local continua salvo)
async function api(rota, { method = 'GET', body } = {}) {
    let resposta
    try {
        resposta = await fetch(`${API_URL}${rota}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${localStorage.getItem('token')}`
            },
            body: body ? JSON.stringify(body) : undefined
        })
    } catch {
        throw new Error('Não foi possível conectar ao servidor.')
    }

    if (resposta.status === 401) {
        localStorage.removeItem('token')
        irParaLogin()
        throw new Error('Sua sessão expirou.')
    }

    const dados = resposta.status === 204 ? null : await resposta.json()
    if (!resposta.ok) throw new Error(dados?.message || 'Algo deu errado')
    return dados
}

// botão que pede confirmação: o primeiro clique troca o texto, o segundo executa
function comConfirmacao(botao, textoConfirmar, acao) {
    const textoOriginal = botao.textContent
    let timer = null
    botao.addEventListener('click', () => {
        if (!botao.classList.contains('confirmando')) {
            botao.classList.add('confirmando')
            botao.textContent = textoConfirmar
            timer = setTimeout(() => {
                botao.classList.remove('confirmando')
                botao.textContent = textoOriginal
            }, 4000)
            return
        }
        clearTimeout(timer)
        botao.classList.remove('confirmando')
        botao.textContent = textoOriginal
        acao()
    })
}

// ---------- meus dados ----------

function sair() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    localStorage.removeItem('carrinho') // o cache é do usuário que saiu
    window.location.href = './login.html'
}

function criarLinha(rotulo, valor) {
    const linha = criarElemento('div', 'perfil-linha')
    linha.append(criarElemento('dt', '', rotulo), criarElemento('dd', '', valor))
    return linha
}

let usuarioAtual = null

async function carregarDados() {
    try {
        usuarioAtual = await api('/usuarios/me')
        mostrarDados()
    } catch (err) {
        conteudoDados.textContent = err.message
    }
}

function mostrarDados(mensagem) {
    conteudoDados.innerHTML = ''

    if (mensagem) {
        const aviso = criarElemento('p', 'perfil-aviso sucesso', mensagem)
        aviso.setAttribute('role', 'status')
        conteudoDados.appendChild(aviso)
    }

    const dados = criarElemento('dl', 'perfil-dados')
    dados.append(criarLinha('Nome', usuarioAtual.nome), criarLinha('E-mail', usuarioAtual.email))

    const botoes = criarElemento('div', 'endereco-form-botoes')
    const btnEditar = criarBotao('Editar dados')
    btnEditar.addEventListener('click', abrirFormDados)
    const btnSair = criarBotao('Sair')
    btnSair.addEventListener('click', sair)
    botoes.append(btnEditar, btnSair)

    // atalho para o painel (o painel confere de novo com o servidor)
    if (usuarioAtual.tipo === 'admin') {
        const linkPainel = criarElemento('a', 'btn-login', 'Painel do administrador')
        linkPainel.href = './admin.html'
        botoes.prepend(linkPainel)
    }

    conteudoDados.append(dados, botoes)
}

// nome sempre editável; e-mail e senha pedem a senha atual (o backend confere)
function abrirFormDados() {
    conteudoDados.innerHTML = ''

    const form = criarElemento('form', 'endereco-form')
    form.noValidate = true
    form.appendChild(criarElemento('h3', 'endereco-form-titulo', 'Editar dados'))

    const grade = criarElemento('div', 'endereco-grade')
    grade.append(
        campo('Nome', 'nome', { valor: usuarioAtual.nome, maxLength: 150, autocomplete: 'name' }),
        campo('E-mail', 'email', { valor: usuarioAtual.email, type: 'email', maxLength: 150, autocomplete: 'email' })
    )

    const gradeSenha = criarElemento('div', 'endereco-grade')
    gradeSenha.append(
        campo('Nova senha', 'senha', { obrigatorio: false, type: 'password', minLength: 6, autocomplete: 'new-password' }),
        campo('Confirmar nova senha', 'confirmarSenha', { obrigatorio: false, type: 'password', autocomplete: 'new-password' })
    )

    // só aparece quando a pessoa mexe no e-mail ou digita uma senha nova
    const blocoSenhaAtual = campo('Senha atual', 'senhaAtual', { type: 'password', autocomplete: 'current-password' })
    blocoSenhaAtual.hidden = true
    const dicaSenhaAtual = criarElemento('p', 'perfil-vazio', 'Para trocar o e-mail ou a senha, confirme sua senha atual.')
    dicaSenhaAtual.hidden = true

    const precisaSenhaAtual = () =>
        form.elements.email.value.trim().toLowerCase() !== usuarioAtual.email || form.elements.senha.value !== ''

    form.addEventListener('input', () => {
        const precisa = precisaSenhaAtual()
        blocoSenhaAtual.hidden = !precisa
        dicaSenhaAtual.hidden = !precisa
    })

    const aviso = criarElemento('p', 'perfil-aviso erro')
    aviso.setAttribute('role', 'alert')
    aviso.hidden = true
    const erro = (texto, campoComFoco) => {
        aviso.textContent = texto
        aviso.hidden = false
        if (campoComFoco) form.elements[campoComFoco].focus()
    }

    const botoes = criarElemento('div', 'endereco-form-botoes')
    const btnSalvar = criarElemento('button', 'btn-login', 'Salvar')
    btnSalvar.type = 'submit'
    const btnCancelar = criarBotao('Cancelar')
    btnCancelar.addEventListener('click', () => mostrarDados())
    botoes.append(btnSalvar, btnCancelar)

    form.append(grade, gradeSenha, dicaSenhaAtual, blocoSenhaAtual, aviso, botoes)

    form.addEventListener('submit', async (e) => {
        e.preventDefault()
        aviso.hidden = true

        const nome = form.elements.nome.value.trim()
        const email = form.elements.email.value.trim()
        const senha = form.elements.senha.value
        const senhaAtual = form.elements.senhaAtual.value

        if (!nome) return erro('O nome não pode ficar vazio.', 'nome')
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('Informe um e-mail válido.', 'email')
        if (senha && senha.length < 6) return erro('A nova senha precisa ter pelo menos 6 caracteres.', 'senha')
        if (senha !== form.elements.confirmarSenha.value) return erro('As senhas novas não são iguais.', 'confirmarSenha')
        if (precisaSenhaAtual() && !senhaAtual) return erro('Informe sua senha atual.', 'senhaAtual')

        // manda só o que mudou
        const corpo = {}
        if (nome !== usuarioAtual.nome) corpo.nome = nome
        if (email.toLowerCase() !== usuarioAtual.email) corpo.email = email
        if (senha) corpo.senha = senha
        if (corpo.email || corpo.senha) corpo.senhaAtual = senhaAtual

        if (!Object.keys(corpo).length) return mostrarDados()

        btnSalvar.disabled = true
        btnSalvar.textContent = 'Salvando...'
        try {
            usuarioAtual = await api('/usuarios/me', { method: 'PUT', body: corpo })

            // o carrinho e outras páginas leem o nome/e-mail daqui
            try {
                const salvo = JSON.parse(localStorage.getItem('usuario')) || {}
                localStorage.setItem('usuario', JSON.stringify({ ...salvo, nome: usuarioAtual.nome, email: usuarioAtual.email }))
            } catch {
                // sem localStorage: segue
            }

            mostrarDados(corpo.senha ? 'Dados e senha atualizados.' : 'Dados atualizados.')
        } catch (err) {
            erro(err.message) // ex.: "Senha atual incorreta", "E-mail já cadastrado"
            btnSalvar.disabled = false
            btnSalvar.textContent = 'Salvar'
        }
    })

    conteudoDados.appendChild(form)
    form.elements.nome.focus()
}

// ---------- endereços ----------

let enderecos = []

async function carregarEnderecos() {
    try {
        enderecos = await api('/enderecos')
        renderizarEnderecos()
    } catch (err) {
        listaEnderecos.textContent = err.message
    }
}

function renderizarEnderecos() {
    listaEnderecos.innerHTML = ''
    btnNovoEndereco.hidden = enderecos.length >= 10

    if (!enderecos.length) {
        listaEnderecos.appendChild(criarElemento('p', 'perfil-vazio', 'Você ainda não cadastrou nenhum endereço.'))
        return
    }

    enderecos.forEach((e) => listaEnderecos.appendChild(criarCartaoEndereco(e)))
}

function criarCartaoEndereco(endereco) {
    const cartao = criarElemento('article', 'endereco-cartao')
    if (endereco.principal) cartao.classList.add('principal')

    const topo = criarElemento('div', 'endereco-topo')
    topo.appendChild(criarElemento('strong', '', endereco.apelido || 'Endereço'))
    if (endereco.principal) topo.appendChild(criarElemento('span', 'endereco-selo', 'Principal'))

    const linha1 = [endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(', ')
    const linha2 = `${endereco.bairro} · ${endereco.cidade}/${endereco.estado} · CEP ${formatarCep(endereco.cep)}`

    const acoes = criarElemento('div', 'endereco-acoes')

    if (!endereco.principal) {
        const btnPrincipal = criarBotao('Tornar principal', 'btn-link')
        btnPrincipal.addEventListener('click', async () => {
            btnPrincipal.disabled = true
            try {
                await api(`/enderecos/${endereco.codEndereco}/principal`, { method: 'PATCH' })
                await carregarEnderecos()
            } catch (err) {
                avisar(avisoEnderecos, err.message)
                btnPrincipal.disabled = false
            }
        })
        acoes.appendChild(btnPrincipal)
    }

    const btnEditar = criarBotao('Editar', 'btn-link')
    btnEditar.addEventListener('click', () => abrirFormEndereco(endereco))

    const btnExcluir = criarBotao('Excluir', 'btn-link perigo')
    comConfirmacao(btnExcluir, 'Confirmar exclusão', async () => {
        btnExcluir.disabled = true
        try {
            await api(`/enderecos/${endereco.codEndereco}`, { method: 'DELETE' })
            avisar(avisoEnderecos, 'Endereço excluído.', 'sucesso')
            await carregarEnderecos()
        } catch (err) {
            avisar(avisoEnderecos, err.message)
            btnExcluir.disabled = false
        }
    })

    acoes.append(btnEditar, btnExcluir)
    cartao.append(topo, criarElemento('p', '', linha1), criarElemento('p', 'endereco-detalhe', linha2), acoes)
    return cartao
}

function campo(rotulo, nome, { valor = '', obrigatorio = true, ...attrs } = {}) {
    const label = criarElemento('label', 'login-campo')
    label.appendChild(criarElemento('span', '', obrigatorio ? rotulo : `${rotulo} (opcional)`))
    const input = criarElemento('input')
    input.name = nome
    input.value = valor ?? ''
    input.required = obrigatorio
    Object.assign(input, attrs)
    label.appendChild(input)
    return label
}

// mesmo formulário para cadastrar (sem endereço) e editar (com endereço)
function abrirFormEndereco(endereco = null) {
    lugarForm.innerHTML = ''
    avisoEnderecos.hidden = true
    btnNovoEndereco.hidden = true

    const form = criarElemento('form', 'endereco-form')
    form.noValidate = true
    form.appendChild(criarElemento('h3', 'endereco-form-titulo', endereco ? 'Editar endereço' : 'Novo endereço'))

    const grade = criarElemento('div', 'endereco-grade')
    const cep = campo('CEP', 'cep', {
        valor: endereco ? formatarCep(endereco.cep) : '',
        inputMode: 'numeric',
        maxLength: 9,
        placeholder: '00000-000',
        autocomplete: 'postal-code'
    })
    cep.querySelector('input').addEventListener('input', (e) => {
        const n = e.target.value.replace(/\D/g, '').slice(0, 8)
        e.target.value = n.replace(/^(\d{5})(\d)/, '$1-$2')
    })

    const estado = criarElemento('label', 'login-campo')
    estado.appendChild(criarElemento('span', '', 'Estado'))
    const select = criarElemento('select')
    select.name = 'estado'
    select.required = true
    select.appendChild(new Option('Selecione', ''))
    ESTADOS.forEach((uf) => select.appendChild(new Option(uf, uf)))
    select.value = endereco?.estado || ''
    estado.appendChild(select)

    grade.append(
        campo('Apelido', 'apelido', { valor: endereco?.apelido, obrigatorio: false, maxLength: 50, placeholder: 'Casa, Trabalho...' }),
        cep,
        campo('Rua', 'logradouro', { valor: endereco?.logradouro, maxLength: 150, autocomplete: 'address-line1' }),
        campo('Número', 'numero', { valor: endereco?.numero, maxLength: 20 }),
        campo('Complemento', 'complemento', { valor: endereco?.complemento, obrigatorio: false, maxLength: 100, autocomplete: 'address-line2' }),
        campo('Bairro', 'bairro', { valor: endereco?.bairro, maxLength: 100 }),
        campo('Cidade', 'cidade', { valor: endereco?.cidade, maxLength: 100, autocomplete: 'address-level2' }),
        estado
    )
    form.appendChild(grade)

    // o primeiro endereço já vira principal sozinho, então só pergunta se já existe algum
    if (!endereco?.principal && enderecos.length > 0) {
        const marcar = criarElemento('label', 'endereco-checkbox')
        const check = criarElemento('input')
        check.type = 'checkbox'
        check.name = 'principal'
        marcar.append(check, document.createTextNode(' Usar como endereço principal'))
        form.appendChild(marcar)
    }

    const aviso = criarElemento('p', 'perfil-aviso erro')
    aviso.setAttribute('role', 'alert')
    aviso.hidden = true

    const botoes = criarElemento('div', 'endereco-form-botoes')
    const btnSalvar = criarElemento('button', 'btn-login', 'Salvar')
    btnSalvar.type = 'submit'
    const btnCancelar = criarBotao('Cancelar')
    btnCancelar.addEventListener('click', fecharFormEndereco)
    botoes.append(btnSalvar, btnCancelar)

    form.append(aviso, botoes)

    form.addEventListener('submit', async (e) => {
        e.preventDefault()
        aviso.hidden = true

        const dados = Object.fromEntries(new FormData(form))
        dados.principal = form.elements.principal?.checked === true
        // edição: complemento/apelido apagados precisam ir vazios para virar null no backend
        dados.apelido = dados.apelido.trim()
        dados.complemento = dados.complemento.trim()

        const faltando = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado'].filter((c) => !String(dados[c]).trim())
        if (faltando.length) {
            aviso.textContent = 'Preencha todos os campos obrigatórios.'
            aviso.hidden = false
            form.elements[faltando[0]].focus()
            return
        }
        if (dados.cep.replace(/\D/g, '').length !== 8) {
            aviso.textContent = 'O CEP precisa ter 8 dígitos.'
            aviso.hidden = false
            form.elements.cep.focus()
            return
        }

        btnSalvar.disabled = true
        btnSalvar.textContent = 'Salvando...'
        try {
            if (endereco) {
                await api(`/enderecos/${endereco.codEndereco}`, { method: 'PUT', body: dados })
            } else {
                await api('/enderecos', { method: 'POST', body: dados })
            }
            fecharFormEndereco()
            avisar(avisoEnderecos, endereco ? 'Endereço atualizado.' : 'Endereço cadastrado.', 'sucesso')
            await carregarEnderecos()
        } catch (err) {
            aviso.textContent = err.message // ex.: "CEP inválido"
            aviso.hidden = false
            btnSalvar.disabled = false
            btnSalvar.textContent = 'Salvar'
        }
    })

    lugarForm.appendChild(form)
    form.querySelector('input').focus()
}

function fecharFormEndereco() {
    lugarForm.innerHTML = ''
    btnNovoEndereco.hidden = enderecos.length >= 10
}

btnNovoEndereco.addEventListener('click', () => abrirFormEndereco())

// ---------- pedidos ----------

async function carregarPedidos() {
    try {
        const pedidos = await api('/pedidos/me')
        listaPedidos.innerHTML = ''

        if (!pedidos.length) {
            listaPedidos.appendChild(criarElemento('p', 'perfil-vazio', 'Você ainda não fez nenhum pedido.'))
            return
        }
        pedidos.forEach((p) => listaPedidos.appendChild(criarPedido(p)))
    } catch (err) {
        listaPedidos.textContent = err.message
    }
}

function criarPedido(pedido) {
    // <details>: o resumo fica sempre visível, os itens abrem com um clique
    const cartao = criarElemento('details', 'pedido-cartao')
    const resumo = criarElemento('summary', 'pedido-resumo')

    const quantidade = pedido.itens.reduce((soma, i) => soma + i.quantidade, 0)
    const info = criarElemento('div', 'pedido-info')
    info.append(
        criarElemento('strong', '', `Pedido #${pedido.codPedido}`),
        criarElemento('span', 'pedido-detalhe', `${formatarData(pedido.createdAt)} · ${quantidade} item(ns)`)
    )

    const status = criarElemento('span', `pedido-status status-${pedido.status.toLowerCase()}`, STATUS_PEDIDO[pedido.status] || pedido.status)
    resumo.append(info, status, criarElemento('span', 'pedido-total', formatarPreco(pedido.valor_total)))

    const corpo = criarElemento('div', 'pedido-corpo')
    const itens = criarElemento('ul', 'pedido-itens')
    pedido.itens.forEach((item) => {
        const li = criarElemento('li', 'pedido-item')
        const nome = item.produto
            ? criarElemento('a', '', item.produto.nome)
            : criarElemento('span', '', 'Produto removido')
        if (item.produto) nome.href = `./produto.html?id=${item.produto.codProduto}`
        li.append(
            nome,
            criarElemento('span', 'pedido-detalhe', `${item.quantidade} × ${formatarPreco(item.preco_unitario)}`),
            criarElemento('span', '', formatarPreco(item.subtotal))
        )
        itens.appendChild(li)
    })
    corpo.appendChild(itens)

    const totais = criarElemento('dl', 'pedido-totais')
    const linhaTotal = (rotulo, valor) => {
        const div = criarElemento('div')
        div.append(criarElemento('dt', '', rotulo), criarElemento('dd', '', valor))
        return div
    }
    if (pedido.desconto > 0) {
        totais.append(
            linhaTotal('Subtotal', formatarPreco(pedido.subtotal)),
            linhaTotal(`Desconto${pedido.codigo_cupom ? ` (${pedido.codigo_cupom})` : ''}`, `− ${formatarPreco(pedido.desconto)}`)
        )
    }
    totais.appendChild(linhaTotal('Total', formatarPreco(pedido.valor_total)))
    corpo.appendChild(totais)

    // o backend só deixa o próprio usuário cancelar enquanto está PENDENTE
    if (pedido.status === 'PENDENTE') {
        const btnCancelar = criarBotao('Cancelar pedido', 'btn-link perigo')
        comConfirmacao(btnCancelar, 'Confirmar cancelamento', async () => {
            btnCancelar.disabled = true
            try {
                await api(`/pedidos/${pedido.codPedido}/cancelar`, { method: 'PATCH' })
                avisar(avisoPedidos, `Pedido #${pedido.codPedido} cancelado.`, 'sucesso')
                await carregarPedidos()
            } catch (err) {
                avisar(avisoPedidos, err.message)
                btnCancelar.disabled = false
            }
        })
        corpo.appendChild(btnCancelar)
    }

    cartao.append(resumo, corpo)
    return cartao
}

// ---------- início ----------
if (localStorage.getItem('token')) {
    carregarDados()
    carregarEnderecos()
    carregarPedidos()
}
