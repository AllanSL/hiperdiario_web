import { supabase } from './supabase';

export interface CnesEstabelecimento {
    codigoCnes: number;
    nomeFantasia: string;
    endereco: string;
    ibgeOriginal?: number;
    latitude?: number;
    longitude?: number;
    uf?: number;
    phone?: string;
}

export interface CnesProfissional {
    name: string;
    specialty: string;
    cns: string;
}

export interface CnesHorario {
    diaSemana?: string;
    hrInicioAtendimento: string;
    hrFimAtendimento: string;
}

export class CnesService {
    /**
     * Formata nomes extensos de estabelecimentos para um padrão mais curto (ex: "UBS ...")
     */
    static formatCnesDisplayName(name: string): string {
        if (!name || name.trim() === '') return name;
        const s = name.trim();

        const patterns = [
            /^\s*(?:unidade\s+(?:b[aá]sica|basica)(?:\s+de\s+(?:saude|saúde))?)\s*[:\-–—]?\s*/i,
            /^\s*(?:unidade|unid)\s+([^\s,;:]{1,8})(?:\s+de\s+(?:saude|saúde))?\s*[:\-–—]?\s*/i,
            /^\s*(?:ubs)\s*[:\-–—]?\s*/i,
            /^\s*(?:ub)\s*(?:de\s+(?:saude|saúde))?\s*[:\-–—]?\s*/i,
            /^\s*(?:posto\s+de\s+(?:saude|saúde))\s*[:\-–—]?\s*/i,
            /^\s*(?:centro\s+de\s+(?:saude|saúde))\s*[:\-–—]?\s*/i,
        ];

        for (const regex of patterns) {
            const match = s.match(regex);
            if (match) {
                const rest = s.replace(regex, '').trim();
                return rest === '' ? 'UBS' : `UBS ${rest}`;
            }
        }

        return name;
    }

    /**
     * Busca os horários de funcionamento de um estabelecimento no CNES.
     */
    static async buscarHorariosFuncionamento(codigoIbge: number | string, codigoCnes: number | string): Promise<CnesHorario[]> {
        try {
            console.log(`[CnesService] Buscando horários via Edge Function para IBGE: ${codigoIbge}, CNES: ${codigoCnes}`);
            
            const sessionResponse = await supabase.auth.getSession();
            const accessToken = sessionResponse.data.session?.access_token;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (accessToken) {
                headers.Authorization = `Bearer ${accessToken}`;
            }

            const { data, error } = await supabase.functions.invoke('cnes_api', {
                body: JSON.stringify({ ibge: codigoIbge, cnes: codigoCnes }),
                headers,
            });

            if (error) {
                console.error(`Erro retornado pela Edge Function:`, error);
                throw new Error(`Erro retornado pela Edge Function: ${error.message}`);
            }

            let parsedData = data;
            if (typeof data === 'string') {
                try {
                    parsedData = JSON.parse(data);
                } catch(e) {}
            }

            console.log('[CnesService] Dados recebidos da API:', parsedData);

            if (Array.isArray(parsedData)) {
                return parsedData.map((item: any) => ({
                    diaSemana: item.diaSemana || '',
                    hrInicioAtendimento: item.hrInicioAtendimento || '07:00',
                    hrFimAtendimento: item.hrFimAtendimento || '17:00',
                }));
            } else if (parsedData && Array.isArray(parsedData.horariosItem)) {
                // Algumas APIs retornam com wrapper
                return parsedData.horariosItem.map((item: any) => ({
                    diaSemana: item.diaSemana || '',
                    hrInicioAtendimento: item.hrInicioAtendimento || '07:00',
                    hrFimAtendimento: item.hrFimAtendimento || '17:00',
                }));
            }
            
            return [];
        } catch (error) {
            console.error('[CnesService] Erro ao buscar horários de funcionamento:', error);
            // Default fallback in case the API completely fails
            return [
                { diaSemana: 'Segunda a Sexta (Fallback)', hrInicioAtendimento: '08:00', hrFimAtendimento: '17:00' }
            ];
        }
    }

    /**
     * Busca estabelecimentos de saúde do CNES (UBS somente).
     *
     * Observações importantes:
     * - A requisição inclui explicitamente `codigo_tipo_unidade=2` na query string
     *   para garantir que a API retorne apenas Unidades Básicas de Saúde (UBS). A
     *   API de dados abertos pode retornar múltiplos tipos (hospitais, clínicas,
     *   etc.); por isso o parâmetro na query evita resultados indesejados.
     * - Mantemos também uma checagem local (`e.codigo_tipo_unidade === 2`) como
     *   camada de segurança caso a API retorne registros mistos.
     * - Se for necessário suportar outros tipos de estabelecimento no futuro,
     *   remova o `codigo_tipo_unidade=2` da query e torne o tipo configurável.
     */
    static async buscarEstabelecimentos(codigoUf: number, codigoMunicipio: number, limit = 100): Promise<CnesEstabelecimento[]> {
        let codMunicipioStr = codigoMunicipio.toString();
        if (codMunicipioStr.length === 7) {
            codMunicipioStr = codMunicipioStr.substring(0, 6);
        }

        // Sempre filtra por tipo de unidade = 2 (UBS)
        const url = `/api-cnes/cnes/estabelecimentos?codigo_tipo_unidade=2&codigo_uf=${codigoUf}&codigo_municipio=${codMunicipioStr}&status=1&limit=${limit}&offset=0`;

        try {
            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            if (!data || !Array.isArray(data.estabelecimentos)) return [];

            return data.estabelecimentos
                .filter((e: any) => e.codigo_tipo_unidade === 2)
                .map((e: any) => {
                const nome = (e.nome_fantasia || '').trim();
                const rua = (e.endereco_estabelecimento || '').trim();
                const numero = (e.numero_estabelecimento || '').trim();
                const bairro = (e.bairro_estabelecimento || '').trim();
                const partes = [rua, numero, bairro].filter(p => p.length > 0).join(', ');

                return {
                    codigoCnes: Number(e.codigo_cnes) || 0,
                    nomeFantasia: CnesService.formatCnesDisplayName(nome || 'Estabelecimento sem nome'),
                    endereco: partes,
                    ibgeOriginal: codigoMunicipio, // Guardamos o IBGE original de 7 dígitos
                    latitude: e.latitude_estabelecimento_decimo_grau || null,
                    longitude: e.longitude_estabelecimento_decimo_grau || null,
                    uf: e.codigo_uf || codigoUf,
                    phone: e.numero_telefone_estabelecimento || '',
                };
            });
        } catch (error) {
            console.error('[CnesService] Erro ao buscar estabelecimentos:', error);
            return [];
        }
    }

    /**
     * Busca os profissionais de um estabelecimento no CNES.
     */
    static async buscarProfissionais(ibge7Digitos: number, cnes7Digitos: number): Promise<CnesProfissional[]> {
        try {
            let ibgeStr = ibge7Digitos.toString();
            if (ibgeStr.length === 7) {
                // A API de profissionais normalmente requer 6 dígitos para o município
                ibgeStr = ibgeStr.substring(0, 6);
            }
            const cnesStr = cnes7Digitos.toString().padStart(7, '0');
            const id = `${ibgeStr}${cnesStr}`;

            const url = `/api-datasus/services/estabelecimentos-profissionais/${id}`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data)) {
                    const profissionaisMap = new Map<string, CnesProfissional>();

                    data.forEach((e: any) => {
                        let cbo = (e.dsCbo || '').trim().toUpperCase();
                        const nome = (e.name || '').trim();
                        const cns = (e.cns || '').trim();

                        if (!cbo || !nome || !cns) return;

                        // Filtro focado nos perfis suportados: Recepcionista, Farmácia e Saúde de nível superior
                        if (
                            cbo.includes('MEDICO') ||
                            cbo.includes('MÉDICO') ||
                            cbo.includes('DENTISTA') ||
                            cbo.includes('ODONTOLOGO') ||
                            cbo.includes('PSICOLOGO') ||
                            cbo.includes('PSICÓLOGO') ||
                            cbo.includes('NUTRICIONISTA') ||
                            cbo.includes('PSIQUIATRA') ||
                            cbo.includes('GINECOLOGISTA') ||
                            cbo.includes('FISIOTERAPEUTA') ||
                            cbo.includes('RECEPCIONISTA') ||
                            cbo.includes('FARMACEUTICO') ||
                            cbo.includes('FARMACÊUTICO')
                        ) {
                            cbo = cbo.replace('CIRURGIAODENTISTA', 'CIRURGIÃO DENTISTA');
                            cbo = cbo.replace('CIRURGIAO DENTISTA', 'CIRURGIÃO DENTISTA');
                            cbo = cbo.replace(/\s+/g, ' ').trim();

                            if (cbo.startsWith('MEDICO ')) cbo = cbo.replace('MEDICO ', 'MÉDICO ');
                            if (cbo.startsWith('PSICOLOGO ')) cbo = cbo.replace('PSICOLOGO ', 'PSICÓLOGO ');

                            const key = `${cns}`;
                            if (!profissionaisMap.has(key)) {
                                profissionaisMap.set(key, { name: nome, specialty: cbo, cns });
                            }
                        }
                    });

                    return Array.from(profissionaisMap.values()).sort((a, b) =>
                        `${a.specialty} - ${a.name}`.localeCompare(`${b.specialty} - ${b.name}`)
                    );
                }
            }
            return [];
        } catch (error) {
            console.error('[CnesService] Erro ao buscar profissionais:', error);
            return [];
        }
    }
}
