// The production HTML contains both games. Only the selected game installs
// listeners, starts a simulation, or opens a room on this page.
const address = new URL(location.href);
const inKitchen = address.searchParams.get("game") === "kitchen";
const entry = document.createElement("script");

if (inKitchen) {
  const source = JSON.parse(document.getElementById("kitchen-page").textContent);
  const kitchen = new DOMParser().parseFromString(source, "text/html");
  const kitchenEntry = kitchen.querySelector("script:not([type])");
  entry.textContent = kitchenEntry.textContent;
  kitchenEntry.remove();
  document.head.replaceChildren(...kitchen.head.childNodes);
  document.body.replaceChildren(...kitchen.body.childNodes);
  address.searchParams.delete("game");
} else {
  const moving = document.getElementById("moving-entry");
  entry.type = "module";
  entry.textContent = moving.textContent;
  moving.remove();
  document.getElementById("kitchen-page").remove();
  address.searchParams.set("game", "kitchen");
}

address.searchParams.delete("room");
if (new URLSearchParams(address.hash.slice(1)).has("room")) address.hash = "";
document.querySelector("[data-switch-game]").href = address.href;
document.body.append(entry);
