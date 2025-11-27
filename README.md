# 🔧 Backend - Nakama Game Server

The backend uses **Nakama** - an open-source game server for real-time multiplayer games.

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Nakama Server                        │
├──────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│  │ Matchmaker  │  │   Match     │  │    RPC      │      │
│  │   System    │  │  Handler    │  │  Functions  │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│         │               │               │                │
│         └───────────────┴───────────────┘                │
│                         │                                │
│              ┌──────────▼──────────┐                     │
│              │   Game State        │                     │
│              │   Management        │                     │
│              └──────────┬──────────┘                     │
│                         │                                │
├─────────────────────────┼────────────────────────────────┤
│              ┌──────────▼──────────┐                     │
│              │    PostgreSQL       │                     │
│              │    (Persistence)    │                     │
│              └─────────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

```
backend/
├── docker-compose.yml     # Container orchestration
├── nakama.yml             # Nakama server configuration
├── package.json           # Node.js dependencies (for TypeScript)
├── modules/
│   └── main.js            # Server-side game logic (JavaScript runtime)
├── migrations/            # Database migrations (auto-managed)
└── README.md              # This file
```

---

## ⚙️ Configuration

### nakama.yml

```yaml
name: tictactoe
data_dir: "./data"

logger:
  level: "DEBUG"
  stdout: true

session:
  token_expiry_sec: 7200

socket:
  max_message_size_bytes: 4096
  max_request_size_bytes: 131072
  read_buffer_size_bytes: 4096
  write_buffer_size_bytes: 4096

runtime:
  js_entrypoint: "main.js"
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:13-alpine
    container_name: nakama_postgres
    environment:
      POSTGRES_DB: nakama
      POSTGRES_USER: nakama
      POSTGRES_PASSWORD: password123
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  nakama:
    image: heroiclabs/nakama:3.24.2
    container_name: nakama_server
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "7350:7350"   # HTTP API
      - "7351:7351"   # Admin Console
    volumes:
      - ./nakama.yml:/nakama/data/local.yml:ro
      - ./modules:/nakama/data/modules:ro
```

---

## 🎮 Server-Side Game Logic

### Match Handler (modules/main.js)

The match handler implements server-authoritative game logic:

| Function | Purpose |
|----------|---------|
| `matchInit` | Initialize game state when match starts |
| `matchJoinAttempt` | Validate player joining |
| `matchJoin` | Handle player joining, assign X/O |
| `matchLeave` | Handle player disconnection |
| `matchLoop` | Game tick (for timers) |
| `matchSignal` | Handle external signals |
| `matchTerminate` | Cleanup when match ends |

### Op Codes

```javascript
const OpCode = {
  GAME_STATE: 1,    // Broadcast game state
  MOVE: 2,          // Player move
  GAME_OVER: 3,     // Game ended
  ERROR: 4,         // Error message
  TURN_UPDATE: 5,   // Turn changed
  PLAYER_JOIN: 6,   // Player joined
  PLAYER_LEAVE: 7   // Player left
};
```

### Move Validation

```javascript
function isValidMove(board, position, playerId, currentTurn) {
  // Check if it's player's turn
  if (currentTurn !== playerId) return false;
  
  // Check if position is valid (0-8)
  if (position < 0 || position > 8) return false;
  
  // Check if cell is empty
  if (board[position] !== null) return false;
  
  return true;
}
```

### Win Detection

```javascript
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],  // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],  // Columns
  [0, 4, 8], [2, 4, 6]              // Diagonals
];

function checkWinner(board) {
  for (const pattern of WIN_PATTERNS) {
    const [a, b, c] = pattern;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: pattern };
    }
  }
  
  if (board.every(cell => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  
  return null;
}
```

---

## 🔌 RPC Functions

### Available RPCs

| RPC ID | Purpose | Parameters |
|--------|---------|------------|
| `healthcheck` | Server health check | None |
| `create_match` | Create a new match | `{ mode: string }` |
| `find_match` | Find via matchmaker | `{ mode: string }` |
| `list_matches` | List active matches | None |
| `get_leaderboard` | Get top players | `{ limit: number }` |
| `get_player_stats` | Get player stats | `{ userId?: string }` |
| `update_stats` | Update player stats | `{ result: string }` |

### Example RPC Call

```javascript
// Client-side
const response = await client.rpc(session, 'get_leaderboard', JSON.stringify({ limit: 10 }));
const data = JSON.parse(response.payload);
```

---

## 🚀 Deployment

### Prerequisites
- AWS EC2 instance (t2.small or larger)
- Docker & Docker Compose installed
- Security group with ports: 22, 80, 7350, 7351

### Step 1: Launch EC2 Instance

```bash
# Connect to EC2
ssh -i your-key.pem ubuntu@your-ec2-ip
```

### Step 2: Install Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
newgrp docker
```

### Step 3: Upload Backend Files

```bash
# From local machine
scp -i your-key.pem -r ./backend ubuntu@your-ec2-ip:~/
```

### Step 4: Start Nakama

```bash
cd ~/backend
docker-compose up -d
```

### Step 5: Verify

```bash
# Check containers
docker ps

# Check logs
docker-compose logs nakama

# Test health endpoint
curl http://localhost:7350/healthcheck
```

---

## 🔐 Security Group Rules

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | Your IP | SSH access |
| Custom TCP | 7350 | 0.0.0.0/0 | Nakama API |
| Custom TCP | 7351 | 0.0.0.0/0 | Nakama Console |
| HTTP | 80 | 0.0.0.0/0 | Frontend |

---

## 📊 Nakama Console

Access the admin console at: `http://your-ec2-ip:7351`

**Default Credentials:**
- Username: `admin`
- Password: `password`

From the console you can:
- View active matches
- Monitor player sessions
- Check server logs
- Manage leaderboards

---

## 🧪 Testing

### Health Check
```bash
curl http://ec2-34-228-198-235.compute-1.amazonaws.com:7350/healthcheck
# Returns: {}
```

### View Logs
```bash
docker-compose logs -f nakama
```

### Restart Services
```bash
docker-compose restart
```

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| Container not starting | Check `docker-compose logs` |
| Port already in use | `sudo lsof -i :7350` and kill process |
| Database connection error | Ensure postgres is healthy first |
| WebSocket not connecting | Check security group has port 7350 open |

---

## 📄 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DB` | nakama | Database name |
| `POSTGRES_USER` | nakama | Database user |
| `POSTGRES_PASSWORD` | password123 | Database password |



<p align="center">
  🎮 Powered by <a href="https://heroiclabs.com/nakama/">Nakama</a>
</p>
