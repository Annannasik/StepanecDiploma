const express = require('express');
const app = express();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const cors = require('cors');
const User = require('./models/User');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');

// Підключення до MongoDB
mongoose.connect('mongodb://localhost:27017/helpSite');

// Middleware для опрацювання JSON даних
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Добавьте эту строку для обслуживания статических файлов из папки StepanecDiploma
app.use(express.static(__dirname));

// Сесія
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 60 * 1000 // срок действия сессии в миллисекундах (день)
    }
}));

// Крайня активність, оновлення сесії та продлення її терміну дії
app.use((req, res, next) => {
    if (req.session && req.session.user) {
        // Обновляем время последней активности пользователя
        req.session.lastActivity = Date.now();
        // Продляем срок действия сессии на день с момента последней активности
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
    }
    next();
});

app.get('/getRole', (req, res) => {
    console.log(req.session.user);
    if (req.session.user) {
        // Отправляем роль и имя пользователя
        res.json({
            role: req.session.user.role,
            username: req.session.user.username,
            userId: req.session.user.id,
            favoriteArticles: req.session.user.favoriteArticles
        });
    } else {
        // Если сессия не содержит информации о пользователе, считаем его гостем
        res.json({ role: 'guest' });
    }
});

app.get('/getUserId', (req, res) => {
    console.log(req.session);
    if (req.session.user) {
        res.json({
            userId: req.session.user.id,
        });
    } else {
        res.status(500).json({ error: 'Помилка отримання користувача' });
    }
});

// Хешування пароля
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

// Опрацювання запиту регістрації
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Проверка, что все поля заполнены
        if (!username || !password) {
            return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
        }

        // Проверяем, существует ли пользователь
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        // Хешируем пароль
        const hashedPassword = await hashPassword(password);

        // Назначаем роль "subscriber" по умолчанию
        const role = 'subscriber';

        // Создаем нового пользователя
        const newUser = new User({
            username,
            password: hashedPassword,
            role
        });

        // Сохраняем пользователя в базу данных
        await newUser.save();

        // Устанавливаем пользователя в сессии для авторизации
        req.session.user = {
            username: newUser.username,
            role: newUser.role
        };

        // Отправляем ответ о успешной регистрации и авторизации
        res.status(200).json({ success: true, message: 'Регистрация и авторизация успешна' });
    } catch (error) {
        console.error('Ошибка регистрации пользователя:', error);
        res.status(500).json({ error: 'Ошибка регистрации пользователя' });
    }
});
// Опрацювання запита авторизації
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Поиск пользователя по username
        const user = await User.findOne({ username });

        // Проверка существования пользователя и сравнение пароля
        if (user && await bcrypt.compare(password, user.password)) {
            // Устанавливаем роль пользователя в сессии
            req.session.user = {
                username: user.username,
                role: user.role,
                id: user._id,
                favoriteArticles: user.favoriteArticles
            };

            // Аутентификация успешна
            res.status(200).json({ success: true, message: 'Авторизація успішна' });
        } else {
            // Неверный логин или пароль
            res.status(400).json({ error: 'Невірний логін або пароль' });
        }
    } catch (error) {
        console.error('Помилка авторизації:', error);
        res.status(500).json({ error: 'Помилка авторизації' });
    }
});

app.post('/logout', (req, res) => {
    // Очищаем данные о пользователе в сессии
    req.session.destroy(err => {
        if (err) {
            console.error('Ошибка при выходе:', err);
            res.status(500).json({ error: 'Ошибка при выходе' });
        } else {
            // Отправляем успешный ответ
            res.status(200).json({ success: true });
        }
    });
});

// Модель для статьи
const { Schema } = mongoose;

const articleSchema = new Schema({
    title: String,
    textFormatted: String,
    textPlain: String,
    image: String,
    filePdf: String, // Добавляем поле для хранения пути к файлу
    sourceLink: String,
    creationTime: String,
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }] // Ссылка на категории
});

const Article = mongoose.model('Article', articleSchema);

// Настройка Multer для загрузки файлов
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/'); // Указываем директорию для сохранения файлов
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Генерируем уникальное имя для файла
    }
});

const upload = multer({ storage: storage });

app.post('/upload', upload.fields([{ name: 'postImage', maxCount: 1 }, { name: 'postFile', maxCount: 1 }]), async (req, res) => {
    try {
        if (!req.files || !req.files['postImage'] || !req.files['postFile']) {
            return res.status(400).send({ success: false, error: 'Один из файлов не был загружен' });
        }

        // Получаем пути к загруженным файлам
        const imagePath = req.files['postImage'][0].path;
        const filePath = req.files['postFile'][0].path;

        // Создаем новую статью в базе данных с путями к файлам
        const newArticle = new Article({
            title: req.body.postTitle,
            textFormatted: req.body.postTextFormatted,
            textPlain: req.body.postTextPlain,
            image: imagePath,
            filePdf: filePath,
            sourceLink: req.body.sourceLink,
            creationTime: req.body.creationTime,
            categories: req.body.categories // Передаем массив выбранных категорий
        });

        // Сохраняем статью в базе данных
        const savedArticle = await newArticle.save();

        // Обновляем категории
        const categoriesToUpdate = await Category.find({ _id: { $in: req.body.categories } }); // Находим выбранные категории
        for (const category of categoriesToUpdate) {
            category.articles.push(savedArticle._id); // Добавляем id новой статьи в массив articles категории
            await category.save(); // Сохраняем изменения в базе данных
        }

        res.status(200).send({ success: true, message: 'Статья успешно сохранена в базе данных' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, error: 'Ошибка сервера' });
    }
});

// Обработка запроса на получение статей
app.get('/articles', async (req, res) => {
    const category = req.query.category; // Получаем значение параметра category из запроса
    try {
        if (category === 'all') {
            const articles = await getAllArticles();
            res.json(articles);
        } else {
            // Если значение параметра category не равно 'all', получаем статьи по указанной категории
            const articles = await getArticlesByCategory(category);
            res.json(articles);
        }
    } catch (error) {
        console.error('Ошибка при получении статей:', error);
        res.status(500).json({ error: 'Ошибка при получении статей' });
    }
});

// Функция для получения всех статей
async function getAllArticles() {
    try {
        // Здесь вам нужно получить список статей из базы данных или другого источника данных
        const articles = await Article.find(); // Пример для Mongoose

        // Возвращаем данные статей
        return articles;
    } catch (error) {
        console.error('Ошибка при получении статей:', error);
        throw error; // Пробрасываем ошибку дальше для обработки в обработчике маршрута
    }
}

// Функция для получения статей по категории
async function getArticlesByCategory(categoryId) {
    try {
        // Здесь вы можете выполнить запрос к базе данных, чтобы получить статьи по указанной категории
        const articles = await Article.find({ categories: categoryId });
        return articles;
    } catch (error) {
        console.error('Ошибка при получении статей по категории:', error);
        throw error; // Пробрасываем ошибку дальше для обработки в обработчике маршрута
    }
}

// Маршрут для получения данных о статье по ее идентификатору
app.get('/articles/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id); // Находим статью по идентификатору в базе данных
        if (!article) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }
        res.json(article); // Отправляем данные о статье в формате JSON
    } catch (error) {
        console.error('Ошибка при получении данных о статье:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Статический роут для отображения изображений
app.use('/images', express.static('uploads'));

app.delete('/articles/:articleId', async (req, res) => {
    const articleId = req.params.articleId;

    try {
        // Находим статью по идентификатору
        const article = await Article.findById(articleId);

        if (!article) {
            return res.status(404).send('Статья не найдена');
        }

        // Удаляем изображение
        if (article.image) {
            fs.unlinkSync(article.image);
        }

        // Удаляем файл PDF
        if (article.filePdf) {
            fs.unlinkSync(article.filePdf);
        }

        // Удаляем статью из базы данных
        await Article.findByIdAndDelete(articleId);

        res.status(200).json({ message: 'Статья, изображение и файл PDF успешно удалены' });
    } catch (error) {
        console.error('Ошибка при удалении статьи, изображения и файла PDF:', error);
        res.status(500).send('Произошла ошибка при удалении статьи, изображения и файла PDF');
    }
});

// PUT-запрос для редактирования статьи
app.put('/articles/:articleId', async (req, res) => {
    const articleId = req.params.articleId; // Получаем ID статьи из параметров запроса
    try {
        // Извлекаем только нужные поля из запроса
        const { postTitle, postTextFormatted, postTextPlain, sourceLink, creationTime } = req.body;

        // Формируем объект с данными для обновления
        const updatedData = {};
        if (postTitle) updatedData.title = postTitle;
        if (postTextFormatted) updatedData.textFormatted = postTextFormatted;
        if (postTextPlain) updatedData.textPlain = postTextPlain;
        if (sourceLink) updatedData.sourceLink = sourceLink;
        if (creationTime) updatedData.creationTime = creationTime;

        // Выполняем обновление статьи, используя только указанные поля
        const updatedArticle = await Article.findByIdAndUpdate(articleId, updatedData, { new: true });

        if (!updatedArticle) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }

        console.log(updatedArticle);
        res.json(updatedArticle); // Отправляем обновленную статью в ответ на запрос
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при редактировании статьи' });
    }
});


const bodyParser = require('body-parser');

// Для парсинга application/json
app.use(bodyParser.json());

const categorySchema = new Schema({
    categoryName: String,
    articles: [{ type: Schema.Types.ObjectId, ref: 'Article' }] // Ссылка на статьи
});

const Category = mongoose.model('Category', categorySchema);

// Настройка Multer для обработки FormData
const uploadCategory = multer();

app.post('/categories', uploadCategory.none(), async (req, res) => {
    try {
        // Проверяем, существует ли категория с таким же именем
        const existingCategory = await Category.findOne({ categoryName: req.body.categoryName });
        if (existingCategory) {
            return res.status(400).send({ success: false, error: 'Категория с таким именем уже существует' });
        }

        // Создаем новую категорию в базе данных
        const newCategory = new Category({
            categoryName: req.body.categoryName
        });

        // Сохраняем категорию в базе данных
        const savedCategory = await newCategory.save();

        res.status(200).send({ success: true, message: 'Категория успешно сохранена в базе данных' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, error: 'Ошибка сервера' });
    }
});

// Обработчик для получения списка всех категорий
app.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (error) {
        console.error('Ошибка при получении списка категорий:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

app.get('/articles/download/:id', async (req, res) => {
    try {
        const article = await Article.findById(req.params.id); // Находим статью по идентификатору в базе данных
        if (!article || !article.filePdf) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        const filePath = path.join(__dirname, article.filePdf); // Путь к файлу на сервере
        res.download(filePath); // Отправляем файл клиенту для скачивания
    } catch (error) {
        console.error('Ошибка при загрузке файла:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обработчик запроса для добавления статьи в список избранных
app.post('/addToFavorites/:articleId', async (req, res) => {
    const userId = req.session.user.id; // Предполагается, что у пользователя есть id в сессии
    const articleId = req.params.articleId; // Получаем id статьи из параметров маршрута

    try {
        // Обновляем данные пользователя в сессии
        req.session.user.favoriteArticles.push(articleId);
        // Используем метод findByIdAndUpdate для добавления articleId в массив favoriteArticles пользователя
        await User.findByIdAndUpdate(userId, { $addToSet: { favoriteArticles: articleId } });

        res.json({ message: 'Статья успешно добавлена в избранное' });
    } catch (error) {
        console.error('Ошибка при добавлении статьи в избранное:', error);
        res.status(500).json({ error: 'Ошибка при добавлении статьи в избранное' });
    }

});

// Обработчик запроса для удаления статьи из списка избранных
app.post('/deleteFromFavorites/:articleId', async (req, res) => {
    const userId = req.session.user.id; // Предполагается, что у пользователя есть id в сессии
    const articleId = req.params.articleId; // Получаем id статьи из параметров маршрута

    try {
        // Удаляем articleId из массива favoriteArticles в данных пользователя в сессии
        req.session.user.favoriteArticles = req.session.user.favoriteArticles.filter(id => id !== articleId);
        // Используем метод findByIdAndUpdate для удаления articleId из массива favoriteArticles пользователя
        await User.findByIdAndUpdate(userId, { $pull: { favoriteArticles: articleId } });

        res.json({ message: 'Статья успешно удалена из избранного' });
    } catch (error) {
        console.error('Ошибка при удалении статьи из избранного:', error);
        res.status(500).json({ error: 'Ошибка при удалении статьи из избранного' });
    }
});
// Обработчик запроса для получения статей, добавленных в избранное пользователем
app.get('/articlesFavorite', async (req, res) => {
    const userId = req.session.user.id; // Получаем id пользователя из сессии

    try {
        // Находим пользователя по его id и извлекаем список избранных статей
        const user = await User.findById(userId).populate('favoriteArticles');
        const favoriteArticles = user.favoriteArticles;

        res.json(favoriteArticles);
    } catch (error) {
        console.error('Ошибка при получении избранных статей:', error);
        res.status(500).json({ error: 'Ошибка при получении избранных статей' });
    }
});
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Что-то пошло не так на сервере!');
});

// Запуск сервера
app.listen(3000, () => {
    console.log('Server start on port 3000');
});
