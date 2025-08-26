// Máscara de CEP
const zipCodeMask = (value) => {
  if (!value) return "";
  value = value.replace(/\D/g, "");
  return value.replace(/(\d{5})(\d)/, "$1-$2");
};

// Aplica máscara no campo
document.getElementById("cep").addEventListener("input", (e) => {
  e.target.value = zipCodeMask(e.target.value);
});

// Loader
function showLoader() {
  document.getElementById("loader").classList.remove("hidden");
}
function hideLoader() {
  document.getElementById("loader").classList.add("hidden");
}

// Dark mode
function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

// Buscar CEP
async function buscarCep(event) {
  event.preventDefault();

  const input = document.getElementById("cep").value;
  const errorMessage = document.getElementById("error-message");
  const textOutput = document.getElementById("text");
  const copyBtn = document.getElementById("copyBtn");

  if (input.trim() === "") {
    errorMessage.textContent = "Por favor, digite um CEP válido!";
    textOutput.innerHTML = "";
    copyBtn.classList.add("hidden");
    return;
  }

  try {
    errorMessage.textContent = "";
    textOutput.innerHTML = "";
    copyBtn.classList.add("hidden");
    showLoader();

    const response = await fetch(`https://viacep.com.br/ws/${input}/json/`);
    if (!response.ok) throw new Error("Erro na requisição");

    const data = await response.json();
    if (data.erro) {
      textOutput.innerHTML = "❌ CEP não encontrado!";
      return;
    }

    const endereco = `
      <b>Logradouro:</b> ${data.logradouro || "-"}<br>
      <b>Complemento:</b> ${data.complemento || "-"}<br>
      <b>Cidade:</b> ${data.localidade || "-"}<br>
      <b>Estado:</b> ${data.uf || "-"}<br>
      <b>Bairro:</b> ${data.bairro || "-"}
    `;
    textOutput.innerHTML = endereco;
    copyBtn.classList.remove("hidden");

    salvarHistorico(input);
  } catch (error) {
    textOutput.innerHTML = "❌ Erro ao buscar CEP!";
    console.error(error);
  } finally {
    hideLoader();
  }
}

// Limpar formulário
function limparForm(event) {
  event.preventDefault();
  document.getElementById("cep").value = "";
  document.getElementById("text").innerHTML = "";
  document.getElementById("error-message").textContent = "";
  document.getElementById("copyBtn").classList.add("hidden");
}

// Copiar endereço
function copiarEndereco() {
  const endereco = document.getElementById("text").innerText;
  if (endereco.trim() === "") return;
  navigator.clipboard.writeText(endereco);
  alert("📋 Endereço copiado para a área de transferência!");
}

// Histórico de buscas
function salvarHistorico(cep) {
  let history = JSON.parse(localStorage.getItem("cepHistory")) || [];
  if (!history.includes(cep)) {
    history.unshift(cep);
    if (history.length > 5) history.pop(); // mantém só últimos 5
    localStorage.setItem("cepHistory", JSON.stringify(history));
  }
  renderHistorico();
}

function renderHistorico() {
  let history = JSON.parse(localStorage.getItem("cepHistory")) || [];
  const list = document.getElementById("history");
  list.innerHTML = "";
  history.forEach((cep) => {
    const li = document.createElement("li");
    li.textContent = cep;
    li.classList.add("cursor-pointer", "hover:text-blue-700");
    li.onclick = () => {
      document.getElementById("cep").value = cep;
      buscarCep(new Event("click"));
    };
    list.appendChild(li);
  });
}

// Renderiza histórico ao carregar a página
renderHistorico();
