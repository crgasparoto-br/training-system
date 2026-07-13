import type { ContractTemplate } from '../../services/contract.service';

export const ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME =
  'Treinamento Físico Personalizado - ACESSO';

export const ACCESS_PERSONAL_TRAINING_TEMPLATE_SOURCE =
  'Instrumento Particular de Prestação de Serviços de Treinamento Físico Personalizado — 26 de fevereiro de 2026';

export const ACCESS_YEAR_END_RECESS_CLAUSE =
  '<p><strong>6.5.</strong> Durante o período de recesso compreendido entre 24/12/2025 e 04/01/2026, não serão realizados atendimentos presenciais regulares. Nesse período, o CONTRATANTE terá direito à planilha de treinamento e à assessoria para ajustes e esclarecimento de dúvidas por internet ou telefone.</p>';

export function createAccessPersonalTrainingTemplate(): Partial<ContractTemplate> {
  return {
    name: ACCESS_PERSONAL_TRAINING_TEMPLATE_NAME,
    description:
      `Modelo ACESSO para prestação de serviços de treinamento físico personalizado, baseado em ${ACCESS_PERSONAL_TRAINING_TEMPLATE_SOURCE}.`,
    version: 1,
    status: 'DRAFT',
    headerHtml: `
<p style="text-align: center;"><strong>INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS DE “TREINAMENTO FÍSICO PERSONALIZADO”</strong></p>
<p><strong>CONTRATADO:</strong> {{empresa.razaoSocial}}, inscrita no CNPJ sob nº {{empresa.cnpj}}, registrada no Conselho Regional de Educação Física sob nº {{empresa.cref}}, estabelecida em {{empresa.endereco}}, neste ato representada pelo Prof. {{professor.nome}}, CREF {{professor.cref}}.</p>
<p><strong>CONTRATANTE:</strong> {{aluno.nome}}, RG {{aluno.rg}}, CPF {{aluno.cpf}}, residente em {{aluno.enderecoCompleto}}.</p>
<p>Pelo presente instrumento, as partes acima qualificadas têm entre si justo e contratado, na melhor forma de direito, a prestação do serviço de “Treinamento Físico Personalizado”, de acordo com as cláusulas seguintes.</p>
`.trim(),
    footerHtml: `
<div class="signatures">
  <p>CONTRATADO e CONTRATANTE, após leitura cuidadosa e de acordo com todos os itens do presente contrato, assinam o instrumento em duas vias de igual teor.</p>
  <p>Para clareza, firmam o presente em Sorocaba/SP, em {{contrato.dataAssinatura}}.</p>
  <br />
  <p>_____________________________________<br /><strong>CONTRATADO</strong><br />{{empresa.razaoSocial}}</p>
  <br />
  <p>_____________________________________<br /><strong>CONTRATANTE</strong><br />{{aluno.nome}}</p>
  <br />
  <p>_____________________________________<br /><strong>TESTEMUNHA</strong><br />Nome: ______________________________<br />RG: ________________________________</p>
  <br />
  <p>_____________________________________<br /><strong>TESTEMUNHA</strong><br />Nome: ______________________________<br />RG: ________________________________</p>
</div>
<p><strong>{{empresa.razaoSocial}}</strong> · CNPJ {{empresa.cnpj}} · CREF {{empresa.cref}}<br />{{empresa.endereco}}</p>
`.trim(),
    clauses: [
      {
        order: 1,
        title: 'Do objetivo do contrato',
        bodyHtml: `
<p><strong>1.1.</strong> O presente contrato tem como objetivo estabelecer as regras da prestação do serviço de treinamento físico personalizado (Personal Trainer), constituído por avaliação, planejamento e acompanhamento de programa de treinamento estabelecido pelo CONTRATADO, levando em consideração as características individuais e os objetivos do CONTRATANTE.</p>
`.trim(),
        required: true,
        editable: true,
      },
      {
        order: 2,
        title: 'Das características do serviço',
        bodyHtml: `
<p><strong>2.1.</strong> O CONTRATADO prestará os serviços nos dias e horários definidos em {{contrato.horarios}}.</p>
<p><strong>2.2.</strong> Os serviços serão prestados nas dependências do centro de atividade física do Hospital Oftalmológico de Sorocaba (BOSFit) ou em outros locais por conveniência do CONTRATANTE. Eventuais custos relacionados à utilização do BOSFit são de responsabilidade do CONTRATADO. Custos relacionados à utilização de outros locais escolhidos por conveniência do CONTRATANTE são de responsabilidade do CONTRATANTE. A alteração do local de treinamento deverá ser informada com, no mínimo, 7 (sete) dias de antecedência e dependerá da disponibilidade do CONTRATADO.</p>
<p><strong>2.3.</strong> As sessões de treinamento físico personalizado terão duração entre 30 (trinta) e 60 (sessenta) minutos, conforme os objetivos da fase do treinamento e os horários estabelecidos no item 2.1.</p>
<p><strong>2.4.</strong> Integram o serviço contratado e constituem obrigações do CONTRATADO:</p>
<ol>
  <li>realizar o acompanhamento presencial das sessões de treinamento estabelecidas no item 2.1;</li>
  <li>realizar, no mínimo, 4 (quatro) avaliações físicas completas por ano, contemplando composição corporal e capacidades físicas, com periodicidade estabelecida no plano de trabalho;</li>
  <li>agendar a avaliação de composição corporal fora do horário regular descrito no item 2.1 e realizar a avaliação das capacidades físicas junto às sessões regulares, sempre que aplicável;</li>
  <li>realizar o controle das cargas de treinamento de acordo com o plano elaborado;</li>
  <li>disponibilizar planilha de treinamento quando o CONTRATANTE se ausentar das sessões por período superior a 1 (uma) semana, desde que comunicado com, no mínimo, 15 (quinze) dias de antecedência;</li>
  <li>disponibilizar planilha de treinamento para dias adicionais aos definidos no item 2.1, quando necessário e estabelecido pelo CONTRATADO.</li>
</ol>
`.trim(),
        required: true,
        editable: true,
      },
      {
        order: 3,
        title: 'Dos valores contratados, formas de pagamento e vigência',
        bodyHtml: `
<p><strong>3.1.</strong> Pela prestação dos serviços contratados, o CONTRATANTE pagará ao CONTRATADO a quantia mensal de {{contrato.valorMensal}} ({{contrato.valorMensalExtenso}}), com vencimento no dia {{contrato.diaVencimento}} de cada mês, iniciando-se a primeira parcela no ato da assinatura do contrato.</p>
<p><strong>3.2.</strong> Será concedida tolerância de 3 (três) dias para o pagamento da mensalidade a partir do vencimento estabelecido no item 3.1. Após esse prazo, será aplicada multa de 10% (dez por cento).</p>
<p><strong>3.3.</strong> O pagamento mensal poderá ser realizado por transferência bancária, cheque ou em espécie. Dados bancários: Banco Inter, agência 0001, conta corrente 395971411, CNPJ/Chave PIX 57.636.561/0001-07.</p>
<p><strong>3.4.</strong> O presente contrato permanecerá vigente até que uma das partes manifeste formalmente a intenção de rescindi-lo ou até que seja alterado por adendo assinado por ambas as partes.</p>
`.trim(),
        required: true,
        editable: true,
      },
      {
        order: 4,
        title: 'Das formas de rescisão contratual',
        bodyHtml: `
<p><strong>4.1.</strong> O presente instrumento poderá ser rescindido a qualquer momento por qualquer das partes, mediante aviso prévio de, no mínimo, 30 (trinta) dias. Em caso de rescisão pelo CONTRATADO, os serviços serão mantidos durante o período do aviso prévio ou o valor correspondente será restituído ao CONTRATANTE. Em caso de rescisão pelo CONTRATANTE, permanecerá devido o pagamento dos serviços referentes aos 30 (trinta) dias do aviso prévio, podendo o CONTRATANTE usufruir dos serviços ou abrir mão deles sem direito à restituição.</p>
<p><strong>4.2.</strong> O presente instrumento poderá ser rescindido imediatamente, a critério da parte não infratora e independentemente de notificação judicial ou extrajudicial, quando ocorrer ao menos uma das situações abaixo:</p>
<p><strong>4.2.1.</strong> atraso no pagamento de qualquer mensalidade por prazo superior a 10 (dez) dias corridos após o vencimento definido no item 3.1;</p>
<p><strong>4.2.2.</strong> não comparecimento injustificado do CONTRATANTE a mais de 5 (cinco) sessões no período de 30 (trinta) dias;</p>
<p><strong>4.2.3.</strong> não comparecimento injustificado do CONTRATADO a mais de 2 (duas) sessões no período de 30 (trinta) dias;</p>
<p><strong>4.2.4.</strong> descumprimento, pelo CONTRATADO, de qualquer obrigação descrita no item 2.4.</p>
<p><strong>4.3.</strong> Na hipótese de rescisão pelo motivo previsto no item 4.2.1, o CONTRATANTE deverá quitar a mensalidade em atraso, respeitando o disposto no item 4.1.</p>
<p><strong>4.4.</strong> Na hipótese de rescisão pelo motivo previsto no item 4.2.3, o CONTRATADO deverá restituir ao CONTRATANTE o valor da mensalidade referente ao mês da ocorrência, respeitando o disposto no item 4.1.</p>
`.trim(),
        required: true,
        editable: true,
      },
      {
        order: 5,
        title: 'Das normas sobre atrasos, faltas e reposições',
        bodyHtml: `
<p><strong>5.1.</strong> Em todas as sessões de treinamento ou avaliação será tolerado atraso de até 20 (vinte) minutos para o comparecimento das partes no local estabelecido, prontas para o início das atividades e com vestimentas adequadas.</p>
<p><strong>5.2.</strong> Em caso de atraso do CONTRATADO superior ao limite do item 5.1, o CONTRATADO deverá cumprir adequadamente a rotina de treinamento proposta. Na impossibilidade, deverá oferecer reposição da sessão em até 7 (sete) dias.</p>
<p><strong>5.3.</strong> Em caso de atraso do CONTRATANTE superior ao limite do item 5.1, o CONTRATADO ficará desobrigado de permanecer no local, e a sessão será considerada realizada, sem direito à reposição.</p>
<p><strong>5.4.</strong> A sessão será encerrada no horário estabelecido no item 2.1, independentemente de atraso do CONTRATANTE.</p>
<p><strong>5.5.</strong> Caso o CONTRATANTE necessite se ausentar de uma sessão, deverá comunicar o CONTRATADO por telefonema ou mensagem de texto com antecedência mínima de 24 (vinte e quatro) horas. Nessa hipótese, a sessão poderá ser reposta em dia e horário acordados entre as partes dentro do mês corrente.</p>
<p><strong>5.6.</strong> O limite é de 2 (duas) reposições de sessões quando as faltas forem comunicadas conforme o item 5.5. Se a reposição não for possível dentro do mês corrente por incompatibilidade de horários, as sessões pendentes serão consideradas repostas para todos os fins.</p>
<p><strong>5.7.</strong> Caso o CONTRATADO necessite se ausentar, deverá comunicar o CONTRATANTE com antecedência mínima de 24 (vinte e quatro) horas. A sessão deverá ser reposta dentro do mês corrente. Se a reposição for inviável, o CONTRATADO restituirá o valor correspondente à sessão não oferecida.</p>
<p><strong>5.8.</strong> Em caso de problema médico comprovado por atestado, o prazo para comunicação da ausência, por qualquer das partes, será de 1 (uma) hora de antecedência, e as regras de reposição considerarão o mês do encerramento do período do atestado.</p>
<p><strong>5.9.</strong> Se a ausência do CONTRATADO for suprida por outro profissional de sua confiança, treinado e certificado por ele, e a sessão ocorrer integralmente e sem prejuízo ao CONTRATANTE, a sessão será considerada realizada.</p>
`.trim(),
        required: true,
        editable: true,
      },
      {
        order: 6,
        title: 'Dos períodos de férias, feriados, pontos facultativos e recesso',
        bodyHtml: `
<p><strong>6.1.</strong> As sessões que coincidirem com feriados oficiais internacionais, nacionais, estaduais ou municipais serão consideradas realizadas, sem direito à reposição.</p>
<p><strong>6.2.</strong> As sessões que coincidirem com pontos facultativos e não forem realizadas por necessidade do CONTRATADO terão direito à reposição além do limite do item 5.6. Quando não realizadas por necessidade do CONTRATANTE, serão consideradas realizadas, sem direito à reposição.</p>
<p><strong>6.3.</strong> Durante as férias do CONTRATANTE, quando este estiver impossibilitado de comparecer às sessões, será disponibilizada planilha de treinamento para o período de ausência. O pagamento mensal será mantido integralmente, pois o horário permanecerá reservado e a assessoria continuará disponível. As sessões desse período não terão direito à reposição.</p>
<p><strong>6.4.</strong> O CONTRATADO terá direito a 30 (trinta) dias de férias por ano, que poderão ser usufruídos de forma contínua ou parcelada, desde que os períodos não sejam inferiores a 7 (sete) dias. Durante as férias do CONTRATADO, os serviços continuarão sendo oferecidos por profissional competente, de sua confiança, treinado e certificado para dar continuidade ao programa. O CONTRATADO comunicará os períodos de férias com, no mínimo, 15 (quinze) dias de antecedência ou no ato da contratação quando esta ocorrer a menos de 15 (quinze) dias de férias já planejadas.</p>
${ACCESS_YEAR_END_RECESS_CLAUSE}
`.trim(),
        required: true,
        editable: true,
      },
      {
        order: 7,
        title: 'Disposições gerais',
        bodyHtml: `
<p><strong>7.1.</strong> Eventual tolerância das partes quanto ao descumprimento de qualquer cláusula não importará novação, constituindo mera liberalidade e permanecendo inalteradas as demais condições estabelecidas.</p>
<p><strong>7.2.</strong> Fica eleito o foro da Comarca de Sorocaba/SP para dirimir qualquer controvérsia oriunda deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>
`.trim(),
        required: true,
        editable: true,
      },
    ],
  };
}
