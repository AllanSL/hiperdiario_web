import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const { action, cpf, password, patientData } = await req.json()

    const cleanCpf = cpf?.replace(/\D/g, '')
    if (!cleanCpf) throw new Error('CPF é obrigatório')

    if (action === 'create' || action === 'check') {
      let userId: string | null = null;
      let existingEmail: string | null = null;

      // 1. Procurar por CPF nas tabelas de profissionais e pacientes
      console.log(`Buscando CPF ${cleanCpf} nas tabelas...`);
      
      const { data: profData } = await supabaseClient
        .from('professionals')
        .select('user_id')
        .eq('cpf', cleanCpf)
        .maybeSingle()

      if (profData?.user_id) {
        userId = profData.user_id
        console.log(`Encontrado no Professionals: ${userId}`);
      } else {
        const { data: patData } = await supabaseClient
          .from('patients')
          .select('user_id')
          .eq('cpf', cleanCpf)
          .maybeSingle()
        
        if (patData?.user_id) {
          userId = patData.user_id
          console.log(`Encontrado no Patients: ${userId}`);
        }
      }

      // 2. Se encontramos um user_id, buscar o email no Auth
      if (userId) {
        const { data: authUser, error: authGetError } = await supabaseClient.auth.admin.getUserById(userId)
        if (!authGetError && authUser?.user) {
          existingEmail = authUser.user.email ?? null
          console.log(`Email encontrado no Auth: ${existingEmail}`);
        }
      }

      if (action === 'check') {
        return new Response(JSON.stringify({ 
          exists: !!userId, 
          email: existingEmail,
          userId: userId 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        })
      }

      // Ação 'create'
      if (!password) throw new Error('Senha é obrigatória para criação/vínculo')

      if (!userId) {
        // Criar novo usuário se não existir
        const email = `${cleanCpf}@hiperdiario.app`
        console.log(`Criando novo usuário: ${email}`);
        
        const { data: userData, error: authError } = await supabaseClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: 'patient', cpf: cleanCpf }
        })

        if (authError) {
          if (authError.message.includes('already registered')) {
            console.log('Email já registrado, tentando listar usuários...');
            const { data: usersData } = await supabaseClient.auth.admin.listUsers()
            const foundUser = usersData.users.find(u => u.email === email)
            if (foundUser) {
              userId = foundUser.id
              existingEmail = foundUser.email ?? null
            } else {
              throw authError
            }
          } else {
            throw authError
          }
        } else {
          userId = userData.user.id
          existingEmail = userData.user.email ?? null
        }
      } else {
        // Usuário já existe, vamos verificar a senha antes de prosseguir
        console.log(`Usuário já existe (${userId}). Verificando senha...`);
        const { error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: existingEmail!,
          password: password,
        })

        if (signInError) {
          console.error('Falha na verificação de senha para usuário existente:', signInError.message);
          throw new Error('CPF já cadastrado com outra senha. Caso tenha esquecido, utilize a recuperação de senha.');
        }

        // Senha correta, podemos atualizar metadados se necessário
        console.log(`Senha verificada para ${userId}. Atualizando metadados...`);
        await supabaseClient.auth.admin.updateUserById(userId, {
          user_metadata: { role: 'patient', cpf: cleanCpf }
        })
      }

      // 3. Upsert no registro do paciente
      console.log(`Realizando upsert no paciente para user_id: ${userId}`);
      const { data: patientRecord, error: patientError } = await supabaseClient
        .from('patients')
        .upsert({
          ...patientData,
          user_id: userId,
          cpf: cleanCpf,
          updated_at: new Date().toISOString()
        }, { onConflict: 'cpf' })
        .select()
        .single()

      if (patientError) {
        console.error('Erro no upsert do paciente:', patientError);
        throw patientError
      }

      return new Response(JSON.stringify({ 
        user_id: userId, 
        email: existingEmail,
        patient: patientRecord 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    throw new Error('Ação inválida')

  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
