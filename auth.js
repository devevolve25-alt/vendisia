// auth.js
// Gerencia a autenticação de usuários.

import { supabaseClient } from './config.js';

async function logout() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error("Erro ao fazer logout:", error.message);
            alert("Erro ao sair: " + error.message);
        } else {
            console.log("Usuário desconectado.");
            // Redireciona o usuário para a página inicial após o logout
            window.location.href = 'https://vendisia.ia.br/';
        }
    } catch (err) {
        console.error("Exceção durante o logout:", err);
        alert("Ocorreu um erro inesperado ao tentar sair.");
    }
}

export { logout };
