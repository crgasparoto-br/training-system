import { useState, type FocusEvent } from 'react';
import {
  formatCep,
  getCepLookupFeedbackMessage,
  lookupCep,
  onlyCepDigits,
  type CepAddress,
} from '../services/cep.service';

/**
 * Encapsula o padrão de preenchimento assistido de CEP compartilhado entre
 * formulários que consultam o endereço (ex.: AlunoForm, PublicPreRegistration):
 * formata o valor digitado a cada alteração e, ao perder o foco com um CEP
 * completo, consulta o serviço `cep.service.ts` para autopreencher o
 * endereço. Falha na consulta (rede indisponível, CEP não encontrado etc.)
 * apenas expõe uma mensagem de erro -- nunca bloqueia o preenchimento manual
 * dos campos de endereço.
 */
export function useCepAutofill(onAddressFound: (address: CepAddress) => void) {
  const [cepError, setCepError] = useState<string | null>(null);

  const formatZipCodeInput = (value: string) => {
    setCepError(null);
    return formatCep(value);
  };

  const handleZipCodeBlur = async (event: FocusEvent<HTMLInputElement>) => {
    const cep = onlyCepDigits(event.target.value);

    if (cep.length < 8) {
      return;
    }

    setCepError(null);

    try {
      const address = await lookupCep(cep);

      if (!address) {
        return;
      }

      onAddressFound(address);
    } catch (error) {
      setCepError(getCepLookupFeedbackMessage(error));
    }
  };

  return { cepError, setCepError, formatZipCodeInput, handleZipCodeBlur };
}
