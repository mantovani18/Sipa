const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
let participants = [];
let selectedDay = 0;
let attendance = [];
const $ = (selector) => document.querySelector(selector);
const api = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erro na operação.");
  return data;
};
const showToast = (message) => { const toast = $("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2800); };
const dayDate = (index) => { const date = new Date(); date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + index); return date.toISOString().slice(0, 10); };
const formatDate = (date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
function renderNavigation() {
  document.querySelectorAll(".nav-item, [data-go]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view || button.dataset.go)));
}
function openView(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active-view", section.id === view));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const titles = { dashboard: "Visão geral", attendance: "Presença", people: "Participantes", raffle: "Sorteio" };
  $("#page-title").textContent = titles[view];
  if (view === "attendance") loadAttendance();
  if (view === "raffle") loadRaffle();
}
async function loadPeople() {
  participants = await api("/api/participants");
  $("#people-count").textContent = participants.length;
  $("#people-total").textContent = `${participants.length} pessoa${participants.length === 1 ? "" : "s"}`;
  $("#people-list").innerHTML = participants.map((person) => `<tr><td>${person.name}</td><td>${person.department}</td><td>${person.registration}</td><td>${formatDate(new Date(person.created_at))}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nenhum participante cadastrado.</td></tr>`;
}
function renderDays() {
  $("#day-tabs").innerHTML = DAYS.map((day, i) => `<button class="day-tab ${i === selectedDay ? "active" : ""}" data-day="${i}">${day}</button>`).join("");
  $("#day-tabs").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { selectedDay = Number(button.dataset.day); renderDays(); loadAttendance(); }));
}
async function loadAttendance() {
  renderDays();
  attendance = await api(`/api/attendance?day=${dayDate(selectedDay)}`);
  const search = ($("#attendance-search")?.value || "").toLowerCase();
  const filtered = attendance.filter((person) => `${person.name} ${person.registration}`.toLowerCase().includes(search));
  $("#attendance-total").textContent = `${attendance.filter((person) => person.present).length} presentes de ${attendance.length}`;
  $("#attendance-list").innerHTML = filtered.map((person) => `<tr><td>${person.name}</td><td>${person.department}</td><td>${person.registration}</td><td class="right"><button class="check ${person.present ? "on" : ""}" data-id="${person.id}" title="${person.present ? "Remover presença" : "Marcar presença"}">${person.present ? "✓" : ""}</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nenhum participante encontrado.</td></tr>`;
  $("#attendance-list").querySelectorAll(".check").forEach((button) => button.addEventListener("click", () => toggleAttendance(button)));
}
async function toggleAttendance(button) {
  const person = attendance.find((item) => item.id === Number(button.dataset.id));
  await api("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: person.id, day: dayDate(selectedDay), present: !person.present }) });
  showToast(person.present ? "Presença removida." : "Presença confirmada.");
  await loadAttendance();
  await loadDashboard();
}
async function loadDashboard() {
  const counts = await Promise.all(DAYS.map((_, i) => api(`/api/attendance?day=${dayDate(i)}`)));
  $("#week-count").textContent = counts.reduce((total, day) => total + day.filter((person) => person.present).length, 0);
  $("#raffle-count").textContent = new Set(counts.flat().filter((person) => person.present).map((person) => person.id)).size;
  $("#day-cards").innerHTML = counts.map((day, i) => { const present = day.filter((person) => person.present).length; const total = day.length || participants.length; const percent = total ? Math.round((present / total) * 100) : 0; return `<article class="day-card" data-day="${i}"><span class="day">${DAYS[i]}</span><strong>${present}<small> / ${total}</small></strong><span class="muted">${percent}% de presença</span><div class="progress"><i style="width:${percent}%"></i></div></article>`; }).join("");
  $("#day-cards").querySelectorAll(".day-card").forEach((card) => card.addEventListener("click", () => { selectedDay = Number(card.dataset.day); openView("attendance"); }));
}
async function loadRaffle() {
  const eligible = await api("/api/raffle");
  $("#eligible-count").textContent = `${eligible.length} pessoa${eligible.length === 1 ? "" : "s"}`;
  $("#eligible-list").innerHTML = eligible.map((person, i) => `<div class="eligible-person"><b>${i + 1}. ${person.name}</b><span>${person.department}</span></div>`).join("") || `<p class="muted">Marque presenças para formar a lista do sorteio.</p>`;
  $("#draw-btn").onclick = () => {
    if (!eligible.length) return showToast("Não há participantes elegíveis ainda.");
    const winner = eligible[Math.floor(Math.random() * eligible.length)];
    $("#winner").textContent = winner.name;
    $("#winner-sub").textContent = `${winner.department} · Parabéns, você ganhou um brinde!`;
  };
}
$("#person-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { const data = Object.fromEntries(new FormData(event.target)); await api("/api/participants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); event.target.reset(); showToast("Participante cadastrado com sucesso."); await loadPeople(); await loadDashboard(); } catch (error) { showToast(error.message); }
});
$("#attendance-search").addEventListener("input", loadAttendance);
$("#today").textContent = formatDate(new Date());
renderNavigation();
renderDays();
(async () => { try { await loadPeople(); await loadDashboard(); } catch { showToast("Conecte o PostgreSQL para iniciar o SIPA."); } })();
