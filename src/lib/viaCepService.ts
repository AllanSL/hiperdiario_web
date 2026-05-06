export interface ViaCepAddress {
  uf: string;
  localidade: string;
  logradouro: string;
  bairro: string;
  complemento: string;
  ibge: string;
}

export class ViaCepService {
  static async buscarEndereco(cep: string): Promise<ViaCepAddress> {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      throw new Error('CEP inválido. Deve conter 8 dígitos.');
    }

    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);

    if (!response.ok) {
      throw new Error('Erro ao consultar o serviço ViaCEP.');
    }

    const data = await response.json();
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }

    return {
      uf: data.uf || '',
      localidade: data.localidade || '',
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      complemento: data.complemento || '',
      ibge: data.ibge || '',
    };
  }
}
