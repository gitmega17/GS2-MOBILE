const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'fiap'; // Substitua por uma chave secreta mais segura em produção

app.use(express.json());
app.use(cors()); // Habilita o CORS para todas as origens

const db = new sqlite3.Database('banco-de-dados.db');

// Lógica para criar as tabelas se elas não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS dados_sensores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        floor_id INTEGER,
        temperature REAL,
        occupancy INTEGER,
        lighting TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Middleware para verificar o token JWT
const authenticateJWT = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];

    if (token) {
        jwt.verify(token, SECRET_KEY, (err, user) => {
            if (err) {
                return res.status(403).json({ message: 'Acesso negado' });
            }
            req.user = user;
            next();
        });
    } else {
        res.status(401).json({ message: 'Token não fornecido' });
    }
};

// Rota para cadastrar um novo usuário
app.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        // Verificar se o usuário já existe
        db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, row) => {
            if (row) {
                return res.status(400).json({ message: 'Usuário já existe' });
            }

            // Criptografar a senha
            const hashedPassword = await bcrypt.hash(password, 10);

            // Inserir o novo usuário na tabela com role padrão como 'user'
            const userRole = role || 'user'; // Se não for fornecido, define como 'user'
            db.run('INSERT INTO usuarios (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, userRole], (err) => {
                if (err) {
                    console.error('Erro ao cadastrar usuário:', err.message);
                    return res.status(500).json({ message: 'Erro ao cadastrar usuário' });
                }
                res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
            });
        });
    } catch (err) {
        console.error('Erro ao processar o cadastro:', err.message);
        res.status(500).json({ message: 'Erro ao processar o cadastro' });
    }
});

// Rota para login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ message: 'Erro ao acessar o banco de dados' });
        }
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Usuário ou senha incorretos' });
        }
        const token = jwt.sign({ userId: user.id, role: user.role }, SECRET_KEY);
        res.json({ token });
    });
});

// Rota para salvar os dados dos sensores (para cada andar)
app.post('/dados-sensores', authenticateJWT, (req, res) => {
    const { floor_id, temperature, occupancy, lighting } = req.body;

    // Validação simples para garantir que todos os dados foram fornecidos
    if (typeof floor_id !== 'number' || typeof temperature !== 'number' || typeof occupancy !== 'number' || typeof lighting !== 'string') {
        return res.status(400).json({ message: 'Dados inválidos fornecidos' });
    }

    db.run(
        `INSERT INTO dados_sensores (floor_id, temperature, occupancy, lighting) VALUES (?, ?, ?, ?)`,
        [floor_id, temperature, occupancy, lighting],
        (err) => {
            if (err) {
                console.error('Erro ao inserir dados no banco de dados:', err.message);
                return res.status(500).json({ message: 'Erro ao processar os dados.' });
            }
            console.log('Dados inseridos no banco de dados com sucesso.');
            res.json({ message: 'Dados recebidos e armazenados com sucesso.' });
        }
    );
});

// Rota para buscar os dados dos sensores
app.get('/dados-sensores', authenticateJWT, (req, res) => {
    const query = `SELECT * FROM dados_sensores`;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar dados no banco de dados:', err.message);
            res.status(500).send('Erro ao buscar os dados.');
        } else {
            res.json(rows);
        }
    });
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
