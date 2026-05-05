
const { createClient } = require('@supabase/supabase-client');

const supabaseUrl = 'https://ltlwvywjuodlftkpahfd.supabase.co';
// Usando a chave anônima que deve estar no seu .env ou lib/supabase.ts
// Como não tenho a chave aqui, vou tentar inferir ou pedir que você veja o erro no console do navegador,
// mas vou deixar o script pronto caso você queira rodar.

async function testQuery() {
    const supabase = createClient(supabaseUrl, 'SUA_ANON_KEY_AQUI');
    const { data, error } = await supabase
        .from('appointments')
        .select('id,date_time,status,shift,notes,location,patients(name,cpf)')
        .limit(1);
    
    console.log('Erro:', error);
    console.log('Dados:', data);
}
