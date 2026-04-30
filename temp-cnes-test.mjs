import { createClient } from '@supabase/supabase-js';

(async () => {
  const supabase = createClient('https://ltlwvywjuodlftkpahfd.supabase.co','sb_publishable_GoYwWlj7Nk25ksYLdxxezQ_Hw8nqx8_');
  const { data, error } = await supabase.functions.invoke('cnes-proxy', {
    body: JSON.stringify({ ibge: 170388, cnes: 2469588 })
  });
  console.log(JSON.stringify({ error, data }, null, 2));
})();
