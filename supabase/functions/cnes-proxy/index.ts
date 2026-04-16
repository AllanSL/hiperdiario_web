// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"

import { corsHeaders } from './cors.ts'

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ibge, cnes } = await req.json()

    if (!ibge || !cnes) {
      return new Response(
        JSON.stringify({ error: 'IBGE e CNES são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Formação do ID da Unidade
    // Obter os 6 primeiros dígitos do IBGE
    const ibge6Str = String(ibge).substring(0, 6)
    
    // Obter o CNES formatado com 7 dígitos (padding de zeros à esquerda)
    const cnes7Str = String(cnes).padStart(7, '0')
    
    // Concatenação
    const cnesId = `${ibge6Str}${cnes7Str}`
    
    console.log(`CNES ID Formado: ${cnesId}`)

    // 2. Passo A: Obtenção do Session Cookie
    const jsessionURL = 'https://cnes.datasus.gov.br/pages/estabelecimentos/consulta.jsp';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    const stepAResponse = await fetch(jsessionURL, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
      }
    });

// Deno headers usually provide .getSetCookie() for multiple instances of headers
    const rawCookies = stepAResponse.headers.getSetCookie 
        ? stepAResponse.headers.getSetCookie() 
        : (stepAResponse.headers.get('set-cookie') || '').split(','); 

    let sessionCookie = '';
    if (rawCookies && rawCookies.length > 0) {
        // Varremos todos os cookies cru da requisição, ex: "JSESSIONID=...; Path=/; Secure" e extrai só a key=value
        sessionCookie = rawCookies
            .filter(c => c.trim().length > 0)
            .map(c => c.split(';')[0].trim())
            .join('; ');
        console.log('Cookies de segurança (F5/TS) e sessão extraídos:', sessionCookie);
    } else {
        console.warn('Nenhum cookie retornado no passo A, tentando prosseguir...');
    }

    // 3. Passo B: Buscar de Fato os Horários de Atendimento
    const fetchDataUrl = `https://cnes.datasus.gov.br/services/estabelecimentos/atendimento/${cnesId}`;
    
    const stepBResponse = await fetch(fetchDataUrl, {
      method: 'GET',
      headers: {
        'Referer': jsessionURL,
        'Accept': 'application/json',
        'User-Agent': userAgent,
        'Cookie': sessionCookie
      }
    });

    if (!stepBResponse.ok) {
        throw new Error(`Falha na API do CNES (Passo B): ${stepBResponse.status} ${stepBResponse.statusText}`);
    }

    const data = await stepBResponse.json();

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Erro no Edge Function proxy:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/cnes-proxy' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
