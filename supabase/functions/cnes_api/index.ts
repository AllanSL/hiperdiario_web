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

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';
    const refererUrl = `https://cnes.datasus.gov.br/pages/estabelecimentos/ficha/identificacao/${cnesId}`;
    const fetchDataUrl = `https://cnes.datasus.gov.br/services/estabelecimentos/atendimento/${cnesId}`;

    const stepBResponse = await fetch(fetchDataUrl, {
      method: 'GET',
      headers: {
        'Referer': refererUrl,
        'User-Agent': userAgent,
        'Host': 'cnes.datasus.gov.br'
      }
    });

    if (!stepBResponse.ok) {
        const errorText = await stepBResponse.text();
        throw new Error(`Falha na API do CNES (Passo B): ${stepBResponse.status} ${stepBResponse.statusText} - ${errorText}`);
    }

    const dataText = await stepBResponse.text();
    let data;
    try {
      data = JSON.parse(dataText);
    } catch (parseError) {
      throw new Error(`Resposta inválida do CNES: ${dataText}`);
    }

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
