const fs = require('fs');
const content = \export interface CnesEstabelecimento {
    codigoCnes: number;
    nomeFantasia: string;
    endereco: string;
    ibgeOriginal?: number;
}

export interface CnesProfissional {
    nome: string;
    especialidade: string;
}

export class CnesService {
    static async buscarEstabelecimentos(codigoUf: number, codigoMunicipio: number, limit = 100): Promise<CnesEstabelecimento[]> {
        let codMunicipioStr = codigoMunicipio.toString();
        if (codMunicipioStr.length === 7) {
            codMunicipioStr = codMunicipioStr.substring(0, 6);
        }

        const url = \\\/api-cnes/cnes/estabelecimentos?codigo_uf=\\$\{codigoUf}&codigo_municipio=\\$\{codMunicipioStr}&status=1&limit=\\$\{limit}&offset=0\\\;

        try {
            const response = await fetch(url);
            if (!response.ok) return [];

            const data = await response.json();
            if (!data || !Array.isArray(data.estabelecimentos)) return [];

            return data.estabelecimentos.filter((e: any) => e.codigo_tipo_unidade === 2).map((e: any) => {
                const nome = (e.nome_fantasia || '').trim();
                const rua = (e.endereco_estabelecimento || '').trim();
                const numero = (e.numero_estabelecimento || '').trim();
                const bairro = (e.bairro_estabelecimento || '').trim();
                const partes = [rua, numero, bairro].filter(p => p.length > 0).join(', ');

                return {
                    codigoCnes: Number(e.codigo_cnes) || 0,
                    nomeFantasia: nome || 'Estabelecimento sem nome',
                    endereco: partes,
                    ibgeOriginal: codigoMunicipio,
                };
            });
        } catch (error) {
            console.error('[CnesService] Erro ao buscar estabelecimentos:', error);
            return [];
        }
    }

    static async buscarProfissionais(ibge7Digitos: number, cnes7Digitos: number): Promise<CnesProfissional[]> {
        try {
            let ibgeStr = ibge7Digitos.toString();
            if (ibgeStr.length === 7) {
                ibgeStr = ibgeStr.substring(0, 6);
            }
            const cnesStr = cnes7Digitos.toString().padStart(7, '0');
            const id = \\\\\$\{ibgeStr}\\$\{cnesStr}\\\;

            const url = \\\/api-datasus/services/estabelecimentos-profissionais/\\$\{id}\\\;

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
                        const nome = (e.nome || '').trim();

                        if (!cbo || !nome) return;

                        if (
                            cbo.includes('MEDICO') ||
                            cbo.includes('MÉDICO') ||
                            cbo.includes('ENFERMEIR') ||
                            cbo.includes('TÉCNICO') ||
                            cbo.includes('TECNICO') ||
                            cbo.includes('AUXILIAR') ||
                            cbo.includes('ASSISTENTE') ||
                            cbo.includes('ATENDENTE') ||
                            cbo.includes('AGENTE') ||
                            cbo.includes('GERENTE') ||
                            cbo.includes('COORDENADOR') ||
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
                            cbo = cbo.replace(/\\s+/g, ' ').trim();

                            if (cbo.startsWith('MEDICO ')) cbo = cbo.replace('MEDICO ', 'MÉDICO ');
                            if (cbo.startsWith('PSICOLOGO ')) cbo = cbo.replace('PSICOLOGO ', 'PSICÓLOGO ');

                            const key = \\\\\$\{nome}-\\$\{cbo}\\\;
                            if (!profissionaisMap.has(key)) {
                                profissionaisMap.set(key, { nome, especialidade: cbo });
                            }
                        }
                    });

                    return Array.from(profissionaisMap.values()).sort((a, b) =>
                        \\\\\$\{a.especialidade} - \\$\{a.nome}\\\.localeCompare(\\\\\$\{b.especialidade} - \\$\{b.nome}\\\)
                    );
                }
            }
            return [];
        } catch (error) {
            console.error('[CnesService] Erro ao buscar profissionais:', error);
            return [];
        }
    }
}\;

fs.writeFileSync('hiperdiario_web/src/lib/cnesService.ts', content, {encoding: 'utf-8'});
