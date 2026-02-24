const SUPABASE_URL = 'https://zplqlcvcpeohtxodvfkq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_YwQnRSNbTfXKnzTAbVWXGw_x8Zs2oK4';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuração Global de Segurança - correcao iao - 2
const LISTA_PLANOS = ['conecta-facil', 'agenda-pro', 'gestao-total'];
let userLogado = null;
const urlParams = new URLSearchParams(window.location.search);
let planoEscolhido = urlParams.get('plano') || localStorage.getItem('plano_mercuria');

// --- Funções de UX para Mensagens e Botões ---
const systemMessageElement = document.getElementById('system-message');

function showMessage(text, isError = false) {
    if (systemMessageElement) {
        systemMessageElement.innerText = text;
        systemMessageElement.classList.toggle('error', isError);
        // Limpar a mensagem após alguns segundos se não for um erro persistente
        if (!isError) {
            setTimeout(() => {
                systemMessageElement.innerText = '';
                systemMessageElement.classList.remove('error');
            }, 5000); // Mensagem some após 5 segundos
        }
    }
}

function toggleButtonState(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.disabled = isLoading;
        button.style.opacity = isLoading ? '0.7' : '1';
        if (isLoading) {
            button.setAttribute('data-original-text', button.innerText);
            button.innerText = 'Carregando...'; // Pode adicionar um spinner aqui se preferir
        } else {
            button.innerText = button.getAttribute('data-original-text') || button.innerText; // Fallback caso não tenha original-text
            button.removeAttribute('data-original-text');
        }
    }
}
// --- Fim das Funções de UX ---


function showStep(stepId) {
    document.getElementById('step-loading').classList.remove('active');
    document.getElementById('step-login').classList.remove('active');
    document.getElementById('step-cadastro').classList.remove('active');
    document.getElementById('step-planos').classList.remove('active');
    document.getElementById('step-info-confirmacao-email').classList.remove('active'); // Garante que a etapa de confirmação também seja desativada
    document.getElementById(stepId).classList.add('active');
    showMessage(''); // Limpa a mensagem ao mudar de etapa
}

// --- Seleção de Plano ---
function selecionarPlano(idPlano) {
    if (!LISTA_PLANOS.includes(idPlano)) {
        showMessage("Plano inválido selecionado.", true);
        showStep('step-planos');
        return;
    }

    planoEscolhido = idPlano;
    localStorage.setItem('plano_mercuria', idPlano);

    // Atualiza URL para persistência
    const novaUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?plano=' + idPlano;
    window.history.pushState({ path: novaUrl }, '', novaUrl);
    
    if (userLogado) {
        // Se o usuário está logado e seleciona um plano, verifica o estabelecimento.
        // A lógica dentro de verificarEstabelecimento determinará se ele vai para cadastro ou já possui um.
        verificarEstabelecimento(); 
    } else {
        showMessage("Plano selecionado! Agora finalize sua conta.");
        showStep('step-login');
    }
}

async function init() {
    showStep('step-loading'); // Inicia com a etapa de loading
    try {
        const params = new URLSearchParams(window.location.search);
        const planoNaUrl = params.get('plano');

        if (LISTA_PLANOS.includes(planoNaUrl)) {
            planoEscolhido = planoNaUrl;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session) {
            userLogado = session.user;
            verificarEstabelecimento();
        } else {
            showStep('step-login');
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                userLogado = session.user;
                verificarEstabelecimento();
            } else if (event === 'SIGNED_OUT') { // Lida com o logout
                userLogado = null;
                planoEscolhido = null;
                localStorage.removeItem('plano_mercuria');
                showStep('step-login');
                showMessage('Você foi desconectado.', false);
            }
        });
    } catch (err) {
        console.error("Erro ao iniciar:", err);
        showMessage("Ocorreu um erro ao carregar o sistema. Tente novamente.", true);
        showStep('step-login');
    }
}

async function loginGoogle() {
    toggleButtonState('btn-google-login', true); // Desabilita o botão Google
    try {
        await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { 
                redirectTo: window.location.origin + window.location.pathname + (planoEscolhido ? "?plano=" + planoEscolhido : "") 
            }
        });
    } catch (err) {
        console.error("Erro ao autenticar com Google:", err);
        showMessage("Erro ao tentar entrar com Google. Tente novamente.", true);
        toggleButtonState('btn-google-login', false); // Habilita o botão
    }
}

async function authSenha(tipo) {
    // BARREIRA PARA CADASTRO (signup) permanece:
    // Um NOVO cadastro SEMPRE exige um plano pré-selecionado para criação do sistema.
    if (tipo === 'signup' && !LISTA_PLANOS.includes(planoEscolhido)) {
        showMessage("Ação necessária: Selecione um plano antes de criar sua conta.", true);
        showStep('step-planos');
        return;
    }
    
    const email = document.getElementById('email-acesso').value;
    const password = document.getElementById('senha-acesso').value;

    if (!email || !password) {
        showMessage("Preencha e-mail e senha.", true);
        return;
    }
    
    // Desabilitar botões
    if (tipo === 'signup') {
        toggleButtonState('btn-cadastrar', true);
        toggleButtonState('btn-entrar', true); // Desabilita o outro botão de login também
    } else {
        toggleButtonState('btn-entrar', true);
        toggleButtonState('btn-cadastrar', true); // Desabilita o outro botão de cadastro também
    }

    showStep('step-loading');
    
    try {
        const { data, error } = (tipo === 'signup') 
            ? await supabaseClient.auth.signUp({ email, password }) 
            : await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            console.error("Erro de autenticação:", error);
            showMessage("Erro: " + error.message, true);
            showStep('step-login');
        } else if (data.user) {
            userLogado = data.user;
            showMessage('Login/Cadastro realizado com sucesso!', false);
            verificarEstabelecimento(); // Usuário logado ou cadastrado, prossegue para verificar o estabelecimento.
        }
    } catch (err) {
        console.error("Erro inesperado em authSenha:", err);
        showMessage("Ocorreu um erro inesperado. Tente novamente.", true);
        showStep('step-login');
    } finally {
        // Habilitar botões
        toggleButtonState('btn-cadastrar', false);
        toggleButtonState('btn-entrar', false);
    }
}

async function verificarEstabelecimento() {
    try {
        await supabaseClient.from('perfis').upsert([{ 
            id: userLogado.id, 
            email_contato: userLogado.email 
        }], { onConflict: 'id' });

        const { data } = await supabaseClient.from('estabelecimentos')
            .select('slug')
            .eq('dono_id', userLogado.id)
            .maybeSingle();

        if (data) {
            showMessage('Redirecionando para o seu sistema...', false);
            window.location.href = `agenda.html?s=${data.slug}&u=dono`;
        } else {
            if (!LISTA_PLANOS.includes(planoEscolhido)) {
                showStep('step-planos');
            } else {
                showStep('step-cadastro');
            }
        }
    } catch (err) {
        console.error("Erro na verificação de estabelecimento:", err);
        showMessage("Ocorreu um erro ao verificar seu negócio. Tente novamente.", true);
        showStep('step-login');
    }
}

function updateSlug() {
    const nome = document.getElementById('nome-salao').value;
    const slug = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    document.getElementById('slug-text').innerText = slug || "...";
    return slug;
}

async function finalizarCadastro() {
    toggleButtonState('btn-criar-sistema', true); // Desabilita o botão

    if (!LISTA_PLANOS.includes(planoEscolhido)) {
        showMessage("Selecione um plano válido antes de criar seu sistema.", true);
        showStep('step-planos');
        toggleButtonState('btn-criar-sistema', false); // Habilita o botão
        return;
    }

    const nomeFantasia = document.getElementById('nome-salao').value;
    if (!nomeFantasia) {
        showMessage('Por favor, digite o nome do seu negócio.', true);
        toggleButtonState('btn-criar-sistema', false); // Habilita o botão
        return;
    }

    showStep('step-loading'); // Mostrar loading enquanto aguarda o servidor

    try {
        // TODO: Chamar Edge Function ou Backend para gerar/validar o slug
        // Por enquanto, usaremos a geração client-side para o slug, mas a recomendação é server-side
        const slug = updateSlug(); // Geração client-side provisória

        // Verificação de unicidade do slug (básica, o servidor deve ter uma mais robusta)
        const { data: existingSlug, error: checkError } = await supabaseClient
            .from('estabelecimentos')
            .select('slug')
            .eq('slug', slug)
            .maybeSingle();

        if (existingSlug) {
            throw new Error('Este nome de negócio já existe. Por favor, escolha outro.');
        }
        if (checkError) throw checkError;

        // LINHA CORRIGIDA AQUI:
        const { error } = await supabaseClient.from('estabelecimentos').insert([{
            dono_id: userLogado.id,
            nome_fantasia: nomeFantasia,
            slug: slug,
            plano_ativo: planoEscolhido,
            status_pagamento: 'trial'
        }]);

        if (error) throw error;
        localStorage.removeItem('plano_mercuria');
        showMessage('Sistema criado com sucesso! Redirecionando...', false);
        window.location.href = `agenda.html?s=${slug}&u=dono`;
    } catch (err) {
        console.error("Erro ao criar sistema:", err);
        showMessage('Erro ao criar sistema: ' + err.message, true);
        showStep('step-cadastro'); // Volta para o formulário de cadastro
    } finally {
        toggleButtonState('btn-criar-sistema', false); // Habilita o botão
    }
}

document.addEventListener('DOMContentLoaded', init);
