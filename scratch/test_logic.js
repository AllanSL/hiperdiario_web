
const testEdgeFunction = (body) => {
  try {
    const { action, cpf, password, patientData, userId: bodyUserId } = body;
    const cleanCpf = cpf?.replace(/\D/g, '');

    if (action === 'create' || action === 'check') {
      if (!cleanCpf) throw new Error('CPF é obrigatório');
      return "Action " + action + " would proceed";
    }

    if (action === 'update') {
      if (!bodyUserId) throw new Error('ID do usuário é obrigatório para atualização');
      if (!password) throw new Error('Nova senha é obrigatória');
      return "Action update would proceed for userId: " + bodyUserId;
    }

    throw new Error('Ação inválida');
  } catch (error) {
    return "Error: " + error.message;
  }
};

const payload = { action: "update", userId: "184964ff-6f66-4dc3-bb3c-647a761f3ee7", password: "123456" };
console.log("Testing with payload:", payload);
console.log("Result:", testEdgeFunction(payload));

const payloadOld = { action: "update", userId: "184964ff-6f66-4dc3-bb3c-647a761f3ee7", password: "123456" };
// Simulated old logic
const testOldLogic = (body) => {
    const { action, cpf, password, patientData } = body;
    const cleanCpf = cpf?.replace(/\D/g, '');
    if (!cleanCpf) return "Error: CPF é obrigatório";
    if (action === 'create' || action === 'check') return "Proceed";
    return "Error: Ação inválida";
};
console.log("\nSimulated old logic result:", testOldLogic(payloadOld));
