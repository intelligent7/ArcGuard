# ArcGuard — Полная документация проекта

> Этот файл содержит ВСЮ информацию для продолжения разработки в любом AI-окружении.

---

## 1. ЧТО ЭТО

**ArcGuard** — бесплатный open-source AML/compliance инструмент для блокчейна Arc Network.
Позволяет проверять происхождение средств, оценивать риск контрагента, блокировать грязные деньги и мониторить аномалии в сети.

**Цель:** Получить признание от команды Arc (роль Architect), заполнить гэп "Compliance & Identity Infrastructure" в экосистеме.

---

## 2. АРХИТЕКТУРА (3 модуля)

```
Модуль 3: ENGINE (ядро, работает 24/7)
├── Сканирует каждый блок Arc через RPC
├── Скорит каждую транзакцию и кошелёк (0-100)
├── Записывает результаты в БД
├── Генерирует алерты при аномалиях
│
├── Модуль 1: BUSINESS API + DASHBOARD
│   ├── REST API для мерчантов/dApp'ов
│   ├── POST /screen → accept/reject/review
│   ├── Batch-проверки
│   ├── On-chain: Solidity modifier + Quarantine Vault
│   └── B2B Dashboard: статистика, отчёты
│
└── Модуль 2: USER SCANNER + ALERTS
    ├── Веб-дашборд: вбей адрес → скор + отчёт
    ├── Transaction Graph визуализация
    ├── Telegram-бот для алертов
    └── Network Feed: лента событий в реальном времени
```

---

## 3. TECH STACK

| Компонент | Технология | Статус |
|-----------|-----------|--------|
| Backend | Node.js + Express (ESM) | ✅ ГОТОВ |
| Blockchain | ethers.js v6 → Arc Testnet RPC | ✅ ГОТОВ |
| Frontend | Vite + React (JSX, не TypeScript) | ✅ ГОТОВ (баг в Mixer Links) |
| Стили | Vanilla CSS, тёмная тема Arc | ✅ ГОТОВ |
| Database | SQLite (планируется) | ❌ |
| Sanctions | OFAC SDN (hardcoded default) | ✅ ГОТОВ |
| Smart Contracts | Solidity (ArcGuard Registry + Quarantine Vault) | ❌ |
| Telegram Bot | node-telegram-bot-api | ❌ |
| Deploy | Vercel (front) + Railway (back) | ❌ |

---

## 4. ARC NETWORK КОНФИГ

```
Network:    Arc Testnet
RPC URL:    https://rpc.testnet.arc.network
Chain ID:   5042002
Currency:   USDC (6 decimals) — нативный газ-токен
Explorer:   https://testnet.arcscan.app
Faucet:     https://faucet.circle.com/
EVM:        Полностью совместим (Hardhat, Foundry, ethers.js)
```

---

## 5. СТРУКТУРА ПРОЕКТА

```
ArcGuard/
├── README.md                          ✅ Готов (для GitHub)
├── .gitignore                         ✅ Готов
├── design_mockup.png                  ✅ Мокап дашборда
├── design_mockup_v1.png               ✅ Альтернативный мокап
│
├── backend/                           ✅ РАБОТАЕТ (порт 3099)
│   ├── package.json
│   ├── node_modules/
│   └── src/
│       ├── index.js                   — Express сервер, порт 3099
│       ├── routes/
│       │   └── api.js                 — Все API-роуты
│       ├── services/
│       │   ├── arcProvider.js         — Подключение к Arc RPC, ethers.js
│       │   ├── sanctionsCheck.js      — OFAC SDN + миксеры + скамы
│       │   └── riskEngine.js          — Алгоритм скоринга 0-100
│       └── data/
│           └── sanctions/
│               └── sanctioned_addresses.json  — Автогенерируется
│
├── frontend/                          ✅ РАБОТАЕТ (порт 5174)
│   ├── package.json
│   ├── index.html
│   ├── node_modules/
│   └── src/
│       ├── main.jsx                   — Точка входа React
│       ├── App.jsx                    — Главный компонент (Scanner)
│       ├── App.css                    — Пустой (стили в index.css)
│       └── index.css                  — Полная дизайн-система Arc style
│
└── contracts/                         ❌ ПЛАНИРУЕТСЯ
    ├── ArcGuardRegistry.sol           — Ончейн-реестр флагнутых адресов
    ├── QuarantineVault.sol            — Эскроу для заморозки грязных средств
    └── IArcGuard.sol                  — Интерфейс для интеграции в dApp'ы
```

---

## 6. API ENDPOINTS (ВСЕ РАБОТАЮТ)

| Method | Endpoint | Описание | Статус |
|--------|----------|----------|--------|
| GET | `/api/v1/risk-score/:address` | Полный скоринг (0-100) | ✅ |
| GET | `/api/v1/sanctions/:address` | Быстрая проверка OFAC | ✅ |
| GET | `/api/v1/wallet/:address` | Инфо о кошельке | ✅ |
| POST | `/api/v1/screen` | Скрининг платежа (accept/reject/review) | ✅ |
| POST | `/api/v1/batch-check` | Пакетная проверка (до 50 адресов) | ✅ |
| GET | `/api/v1/health` | Health check | ✅ |
| GET | `/api/v1/alerts/feed` | Стрим алертов | ❌ |

---

## 7. АЛГОРИТМ СКОРИНГА (Risk Engine)

**Вход:** Адрес кошелька/контракта
**Выход:** Score 0-100 + level (low/medium/high/critical) + checks

### Проверки:

1. **D1: OFAC Sanctions** — exact match с OFAC SDN list. Если совпадение → Score 100, CRITICAL, остальные проверки не нужны.
2. **D2a: Direct Mixer** — адрес сам является миксером? Score +90
3. **B_SCAM: Known Scam** — адрес в базе скамов? Score +85
4. **AGE: Wallet Activity** — txCount: 0 → +25, <3 → +15, <10 → +5, иначе 0
5. **D3-D6: Transaction Patterns** — анализ транзакций:
   - D4 Peel Chain: 1 вход → N мелких выходов (+20)
   - D5 Structuring: повторяющиеся суммы (+15)
   - D3 Chain Hopping: быстрый приём-отправка (+10)
   - C1 Address Poisoning: 0-value transfers (+5)
6. **D2b: Mixer Interaction History** — взаимодействие с миксерами в истории. Score +25 за каждый
7. **D1b: Sanctioned Counterparty** — взаимодействие с санкционными адресами. Score +30 за каждый

**Итоговый скор:** max(all_scores) + sum(minor_scores) * 0.3, capped at 100

---

## 8. ПАТТЕРНЫ УГРОЗ (33 штуки)

Полный каталог находится в: `Arc/ArcGuard_threat_patterns.md`

Краткая сводка категорий:
- **D1-D6 (AML):** OFAC, миксеры, chain hopping, peel chain, structuring, nested services
- **A1-A8 (Эксплойты):** flash drain, reentrancy, flash loan, rug pull, proxy upgrade, oracle manipulation, access control, selfdestruct
- **B1-B5 (Скам):** honeypot, hidden mint, fake airdrop, ponzi, fake revoke
- **C1-C4 (Фишинг):** address poisoning, unlimited approval, permit phishing, fake dApp
- **E1-E7 (Аномалии):** whale movement, massive outflow, CCTP spike, new contract surge, gas spike, sybil, dormant whale

---

## 9. СМАРТ-КОНТРАКТЫ (ПЛАН)

### ArcGuardRegistry.sol
```solidity
// Ончейн-реестр: хранит флагнутые адреса
// Обновляется нашим backend через oracle/admin
contract ArcGuardRegistry {
    mapping(address => uint8) public riskScores;  // 0-100
    mapping(address => bool) public flagged;       // чёрный список
    
    function isClean(address addr) external view returns (bool);
    function getRiskScore(address addr) external view returns (uint8);
    function flagAddress(address addr, uint8 score) external onlyAdmin;
}
```

### QuarantineVault.sol
```solidity
// Эскроу для заморозки грязных средств
// dApp отправляет флагнутые средства сюда вместо обработки
contract QuarantineVault {
    struct Quarantine {
        address sender;
        uint256 amount;
        uint256 timestamp;
        bool released;
    }
    
    function lockFunds(address sender, uint256 amount) external;
    function refund(uint256 quarantineId) external onlyBusiness;
    function freeze(uint256 quarantineId) external onlyBusiness;
}
```

### IArcGuard.sol (интерфейс для dApp'ов)
```solidity
interface IArcGuard {
    function isClean(address addr) external view returns (bool);
    function getRiskScore(address addr) external view returns (uint8);
}

// Использование в dApp — ОДНА СТРОКА:
modifier screened(address sender) {
    require(arcGuard.isClean(sender), "ArcGuard: flagged");
    _;
}
```

### Два режима интеграции для бизнеса:
1. **Hard block** — `require(guard.isClean(sender))` → реверт транзакции
2. **Soft quarantine** — `if (!guard.isClean(sender)) quarantine.lockFunds(...)` → заморозка

---

## 10. ИЗВЕСТНЫЕ БАГИ

1. **Mixer Links карточка:** показывает "undefined Found" вместо числа, когда адрес санкционный и полный анализ не запускается (fast path для OFAC → не заполняет mixerInteraction checks). Фикс: в `App.jsx` проверить наличие `checks.mixerInteraction` перед рендером.

2. **Entity Type неточный:** Для адресов не на Arc Testnet все показывает как "EOA Wallet" потому что `getCode()` возвращает '0x'. Это ожидаемо — мы работаем только с Arc.

---

## 11. ЧТО ДЕЛАТЬ ДАЛЬШЕ (Roadmap)

> ⚠️ ПОЗИЦИОНИРОВАНИЕ: ArcGuard — это ЧИСТО AML/Security/Compliance апка.
> Мы НЕ ловим сибилов (пока), чтобы не собирать хейт крипто-комьюнити.
> Фокус: защита от грязных денег, скама, эксплойтов. Полезный инструмент, а не полиция.

### Phase 1.5: Фиксы + Polish (ТЕКУЩИЙ)
- [x] Пофиксить баг "undefined Found" в Mixer Links
- [ ] Добавить типизацию адреса (EOA/Contract/Agent)
- [ ] Git init + первый коммит + push на GitHub

### Phase 2: Smart Contracts (On-chain интеграция)
- [ ] Написать ArcGuardRegistry.sol
- [ ] Написать QuarantineVault.sol
- [ ] Написать IArcGuard.sol (интерфейс)
- [ ] Задеплоить на Arc Testnet
- [ ] Добавить Solidity modifier + пример интеграции в README

### Phase 3: Network Monitor (Реалтайм)
- [ ] Backend: подписка на новые блоки Arc (polling)
- [ ] Детекторы: whale movement, massive outflow, CCTP spike
- [ ] Telegram бот для алертов
- [ ] Frontend: страница Network Monitor (live feed)

### Phase 4: Arc Network Score (Репутация в сети Arc) ⭐ ОБЯЗАТЕЛЬНО
Аналог "Arbitrum Score" / "Galxe Passport" — но для Arc:

- [ ] **Arc Reputation Score** — отдельный скор (0-100) по активности в сети Arc:
  - Возраст кошелька в сети Arc (дата первой транзакции)
  - Количество транзакций
  - Количество уникальных контрактов, с которыми взаимодействовал
  - Количество деплоев (если деплоил контракты)
  - Общий объём транзакций (volume)
  - Регулярность активности (daily active, weekly, monthly)
  - Разнообразие типов взаимодействий (transfers, swaps, bridges, governance)
- [ ] **Эндпоинт:** `GET /api/v1/arc-score/:address` → Arc Score + breakdown
- [ ] **UI:** Красивая страница "Check your Arc Score" — виральный элемент, который заставит юзеров чекнуть свой адрес
- [ ] **Leaderboard (опционально):** Топ-адресов по Arc Score
- [ ] **Интеграция:** Arc Score как фактор доверия при AML-проверке (высокий Arc Score снижает risk score)

### Phase 5: Gambling/Betting Industry Tracker ⭐ ОБЯЗАТЕЛЬНО
Отслеживание участников азартного рынка в web3:

- [ ] **Entity Database** — база данных организаций:
  - Лицензированные казино/буки (white list)
  - Нелицензированные/серые казино (grey list)
  - Платёжные шлюзы gambling-индустрии
  - Crypto-казино (Stake, Rollbit, BC.Game и т.д.)
  - P2P обменники
- [ ] **Entity Labeling Agent** — автоматический агент который:
  - Мониторит новые контракты и адреса в сети Arc
  - По паттернам транзакций определяет: "это похоже на казино/бук/обменник"
  - Метки: `casino_licensed`, `casino_unlicensed`, `bookmaker`, `payment_gateway`, `p2p_exchange`
  - Маркирует деньги: "эти USDC пришли с нелицензированного казино"
- [ ] **Источники данных для базы:**
  - Известные адреса крупных крипто-казино (публичные)
  - Blockchain analytics: кластеризация адресов по поведению
  - Community reports (форма на сайте: "Report an entity")
  - Парсинг открытых реестров лицензий (MGA, Curacao, UKGC)
- [ ] **API:** `GET /api/v1/entity/:address` → { type: "casino_unlicensed", name: "...", risk: "high" }

### Phase 6: AML Aggregator (OpenRouter-модель) ⭐ ОБЯЗАТЕЛЬНО
Агрегация внешних AML-сервисов через единый API — как OpenRouter для AI:

- [ ] **Единый API — наш эндпоинт, под капотом множество провайдеров:**
  ```
  POST /api/v1/deep-check
  {
    "address": "0x...",
    "providers": ["arcguard", "chainalysis", "elliptic", "scorechain"],
    "mode": "fastest" | "deepest" | "cheapest"
  }
  ```
- [ ] **Интегрировать провайдеров (по мере доступности API-ключей):**
  - ArcGuard (наш собственный engine) — бесплатно, всегда
  - Chainalysis (если получим API доступ)
  - Elliptic
  - ScoreChain
  - Crystal Blockchain
  - Merkle Science
  - AnChain.AI
  - GoPlus Security (бесплатный API!)
  - De.Fi (антискам API)
- [ ] **Агрегированный ответ:**
  ```json
  {
    "address": "0x...",
    "consensus_score": 72,
    "providers": {
      "arcguard": { "score": 75, "flags": [...] },
      "goplus": { "score": 68, "honeypot": false },
      "defi": { "score": 70, "scam_reported": true }
    },
    "verdict": "HIGH RISK — 3/3 providers agree"
  }
  ```
- [ ] **Преимущество:** Бизнесу не нужно интегрировать 5 разных API — подключаешь ArcGuard и получаешь всех сразу
- [ ] **Модель монетизации (будущее):** Бесплатный ArcGuard engine + платный deep-check через внешних провайдеров

### Phase 7: Polish + Deploy
- [ ] Transaction Graph визуализация (D3.js)
- [ ] B2B Dashboard (статистика проверок)
- [ ] Deploy: Vercel (front) + Railway (back)
- [ ] Документация API (Swagger/OpenAPI)
- [ ] Сабмит в Arc House + пост в Discord
- [ ] Подготовить презентацию для Builders Fund


---

## 12. КАК ЗАПУСТИТЬ ПРОЕКТ

### Backend
```bash
cd "Arc/ArcGuard/backend"
npm install          # только первый раз
node src/index.js    # запуск на порту 3099
```

### Frontend
```bash
cd "Arc/ArcGuard/frontend"
npm install          # только первый раз
npx vite --port 5174 # запуск на порту 5174
```

### Тест API
```bash
# Health check
curl http://localhost:3099/api/v1/health

# Скоринг адреса
curl http://localhost:3099/api/v1/risk-score/0x722122df12d4e14e13ac3b6895a86e84145b6967

# Проверка санкций
curl http://localhost:3099/api/v1/sanctions/0x722122df12d4e14e13ac3b6895a86e84145b6967

# Скрининг платежа
curl -X POST http://localhost:3099/api/v1/screen \
  -H "Content-Type: application/json" \
  -d '{"sender": "0x722122df12d4e14e13ac3b6895a86e84145b6967", "amount": 500}'
```

---

## 13. КЛЮЧЕВЫЕ ФАЙЛЫ ДЛЯ КОНТЕКСТА

| Файл | Что содержит |
|------|-------------|
| `Arc/research.md` | Общий ресерч Arc экосистемы, проекты комьюнити, идеи |
| `Arc/ArcGuard_threat_patterns.md` | 33 паттерна угроз + разбивка по модулям |
| `Arc/ArcGuard/README.md` | GitHub README (описание проекта) |
| `Arc/ArcGuard/backend/src/services/riskEngine.js` | Алгоритм скоринга |
| `Arc/ArcGuard/backend/src/services/sanctionsCheck.js` | OFAC + миксеры |
| `Arc/ArcGuard/backend/src/services/arcProvider.js` | Подключение к Arc RPC |
| `Arc/ArcGuard/backend/src/routes/api.js` | Все API-эндпоинты |
| `Arc/ArcGuard/frontend/src/App.jsx` | React-компонент Scanner |
| `Arc/ArcGuard/frontend/src/index.css` | Дизайн-система (Arc style) |
| `Antifraud KYC trainer/` | Курс по антифроду — методики, правила, кейсы |

---

## 14. МЕТОДИКИ ИЗ ANTIFRAUD (применить в ArcGuard)

Источник: `Antifraud KYC trainer/` — курс по антифроду iGaming.
Ниже — адаптированные концепции для блокчейн-контекста.

### 14.1 Матрица решений: Risk Score × Transaction Value

Вместо простого "reject if score > 60", используем 2D-матрицу (как Fraud Score × LTV в iGaming):

| | Score 0-30 (Low) | Score 31-60 (Medium) | Score 61-100 (High) |
|---|---|---|---|
| **Мелкая сумма** (<$100) | ✅ Accept | ✅ Accept + Flag | ⚠️ Review |
| **Средняя** ($100-$10K) | ✅ Accept | ⚠️ Review | 🚫 Reject |
| **Крупная** (>$10K) | ✅ Accept + Log | 🚫 Reject + Alert | 🚫 Reject + Freeze |

**Реализация:** Обновить `POST /api/v1/screen` — добавить параметр `amount` в матрицу решений.

### 14.2 Velocity Rules (частотные правила)

Из SEON Rules Engine — адаптация для блокчейна:

```
Rule: Sybil_Registration_Spike
IF COUNT(new_addresses_funded_from SAME_SOURCE) > 10 IN 1 HOUR
THEN risk_score + 30
TAG: "sybil_cluster"

Rule: Rapid_Drain
IF COUNT(outgoing_tx FROM address) > 20 IN 10 MINUTES  
AND total_value > $50,000
THEN ALERT: "possible_exploit"
TAG: "flash_drain"

Rule: Structuring_Detection  
IF COUNT(tx WHERE amount BETWEEN $9,500 AND $10,000) > 3 IN 24 HOURS
THEN risk_score + 40
TAG: "structuring"
```

### 14.3 Money Laundering Detection (Layering)

Из кейса 5 (Module 5) — "Casino Laundering" адаптирован для Arc:

**Паттерн:** USDC приходит на адрес → минимальная on-chain активность → быстрый вывод через CCTP bridge.

```
Rule: AML_Layering_CCTP
IF total_received > $10,000
AND total_onchain_interactions < 5
AND cctp_bridge_withdrawal > 80% of received
AND time_between_deposit_and_withdrawal < 2 HOURS
THEN risk_score + 60
TAG: "aml_layering"
ACTION: HOLD + ALERT compliance
```

### 14.4 Многоуровневый анализ (4 слоя)

Адаптация из Module 6 "Advanced Architecture":

| Слой iGaming | Слой ArcGuard (блокчейн) | Что проверяем |
|---|---|---|
| Network (IP, ASN) | **List Check** (OFAC, mixers) | Адрес в чёрных списках? |
| Device (fingerprint) | **On-chain Footprint** | Возраст, баланс, txCount, isContract |
| Behavioral (клики) | **Transaction Patterns** | Peel chain, structuring, chain hopping |
| Correlation (graphs) | **Address Graph** | С кем взаимодействовал? Есть ли флагнутые в цепочке? |

**Ключевой принцип:** Антифрод ловит НЕ отдельные флаги, а **невозможные комбинации** и **конфликты** между слоями.

### 14.5 False Positive Protection

Из кейса 10 (Module 5) — "когда НЕ надо банить":

В блокчейне тоже есть privacy-юзеры: свежие адреса, мало транзакций, взаимодействие с privacy-протоколами. Не все из них скамеры.

```
Rule: Privacy_User_Whitelist
IF risk_score > 50
AND sanctions_check = "clear"
AND mixer_interaction = 0
AND wallet_age > 30 DAYS
AND transaction_pattern = "normal"
THEN risk_score OVERRIDE → max(25, score * 0.5)
TAG: "privacy_user_adjusted"
```

**Принцип:** Никогда не блокировать ТОЛЬКО по одному сигналу. Минимум 2 независимых "красных флага" для reject.
