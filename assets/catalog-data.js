export const GAMES = Object.freeze([
  {
    "key": "luckyjetv12",
    "originalName": "Lucky Jet V12",
    "isNew": true,
    "title": "Лаки Джет V12",
    "image": "assets/images/luckyjetv12.webp",
    "href": "games/luckyjetv12.html",
    "kind": "analysis",
    "mode": "live"
  },
  {
    "key": "football",
    "originalName": "Football X",
    "isNew": true,
    "title": "Футбол X",
    "image": "assets/images/football.webp",
    "href": "games/football.html",
    "kind": "football",
    "mode": "demo"
  },
  {
    "key": "luckyjet",
    "originalName": "Lucky Jet",
    "isNew": false,
    "title": "Лаки Джет",
    "image": "assets/images/luckyjet.webp",
    "href": "games/luckyjet.html",
    "kind": "live",
    "mode": "live"
  },
  {
    "key": "minesbb",
    "originalName": "Mines BB",
    "isNew": false,
    "title": "Мины BB",
    "image": "assets/images/minesbb.webp",
    "href": "games/minesbb.html",
    "kind": "mines",
    "mode": "demo"
  },
  {
    "key": "towers",
    "originalName": "Towers",
    "isNew": true,
    "title": "Башни",
    "image": "assets/images/towers.webp",
    "href": "games/towers.html",
    "kind": "towers",
    "mode": "demo"
  },
  {
    "key": "coinflip",
    "originalName": "Coin Flip",
    "isNew": false,
    "title": "Орёл и решка",
    "image": "assets/images/coinflip.webp",
    "href": "games/coinflip.html",
    "kind": "coin",
    "mode": "demo"
  },
  {
    "key": "thimbles",
    "originalName": "King Thimbles",
    "isNew": false,
    "title": "Король напёрстков",
    "image": "assets/images/thimbles.webp",
    "href": "games/thimbles.html",
    "kind": "cups",
    "mode": "demo"
  },
  {
    "key": "mine",
    "originalName": "MINES",
    "isNew": false,
    "title": "Мины",
    "image": "assets/images/mine.webp",
    "href": "games/mine.html",
    "kind": "mines",
    "mode": "demo"
  },
  {
    "key": "rocket",
    "originalName": "Rocket Queen",
    "isNew": false,
    "title": "Королева ракет",
    "image": "assets/images/rocket.webp",
    "href": "games/rocket.html",
    "kind": "flight",
    "mode": "demo"
  },
  {
    "key": "jetx",
    "originalName": "JetX",
    "isNew": false,
    "title": "Джет X",
    "image": "assets/images/jetx.webp",
    "href": "games/jetx.html",
    "kind": "flight",
    "mode": "demo"
  },
  {
    "key": "aviator",
    "originalName": "Aviator",
    "isNew": false,
    "title": "Авиатор",
    "image": "assets/images/aviator.webp",
    "href": "games/aviator.html",
    "kind": "flight",
    "mode": "demo"
  },
  {
    "key": "crash",
    "originalName": "Crash",
    "isNew": true,
    "title": "Краш",
    "image": "assets/images/crash.webp",
    "href": "games/crash.html",
    "kind": "flight",
    "mode": "demo"
  },
  {
    "key": "kamikaze",
    "originalName": "Kamikaze",
    "isNew": true,
    "title": "Камикадзе",
    "image": "assets/images/kamikaze.webp",
    "href": "games/kamikaze.html",
    "kind": "flight",
    "mode": "demo"
  },
  {
    "key": "thimbles2",
    "originalName": "Thimbles",
    "isNew": true,
    "title": "Напёрстки",
    "image": "assets/images/thimbles2.webp",
    "href": "games/thimbles2.html",
    "kind": "cups",
    "mode": "demo"
  }
]);
export const findGame = key => GAMES.find(game => game.key === key);
