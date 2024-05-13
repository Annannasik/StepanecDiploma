let articles = [];
let user;
// Функция для получения роли пользователя
async function getUserRole() {
    try {
        const response = await fetch('/getRole');
        const data = await response.json();
        return { role: data.role, username: data.username, id: data.userId, favoriteArticles: data.favoriteArticles};
    } catch (error) {
        console.error('Ошибка при получении роли пользователя:', error);
        return { role: 'guest', username: null }; // Возвращаем роль "гость" в случае ошибки
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Получаем роль пользователя
        user = await getUserRole();
        console.log(user);

        // Проверяем роль пользователя и отображаем кнопку "Додати" только для админов и редакторов
        if (user.role === 'admin' || user.role === 'editor') {
            const addLink = document.getElementById('addLink');
            addLink.style.display = 'block';
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        const categoryParam = urlParams.get('category');
        //let articles = [];
        console.log(categoryParam);
        if (categoryParam === 'all') {
            const response = await fetch('/articles?category=all');
            articles = await response.json();
        }else{
            const response = await fetch(`/articles?category=${categoryParam}`);
            articles = await response.json();
        }
        articles.sort((a, b) => a.title.localeCompare(b.title));
        const articlesContainer = document.getElementById('articlesContainer');

        articles.forEach(async (article, index) => {
            // Создаем элементы для отображения данных статьи
            const cardCol = document.createElement('div');
            cardCol.classList.add('col');

            const cardElement = document.createElement('div');
            cardElement.classList.add('card', 'mb-3');

            // Загружаем категории для текущей статьи
            const categoryNames = await loadCategoryNames(article.categories);

            cardElement.innerHTML = `
                <div class="row g-0">
                    <div class="col-md-4">
                        <img src="${article.image}" class="img-fluid rounded-0 d-block" style="height: 270px; object-fit: cover;" alt="Article Image">
                    </div>
                    <div class="col-md-8">
                        <div class="card-body">
                            <h5 class="card-title text-start">${article.title}</h5>
                            <p class="card-text text-start">${article.textPlain.length > 130 ? article.textPlain.slice(0, 130) + '...' : article.textPlain}</p>
                            <p class="card-text text-start"><span class="bold-italic">Категорії:</span> ${categoryNames.join(', ')}</p>
                            <p class="card-text text-start"><small class="text-body-secondary">${article.creationTime}</small></p>
                            <!-- Кнопки "Редагувати" и "Видалити" -->
                            <p class="card-text text-start" id="editDeleteButtons${article._id}"></p>
                            <p class="card-text text-start" id="favoriteText${article}"></p>
                        </div>
                    </div>
                </div>
            `;

            cardElement.addEventListener('click', () => {
                window.location.href = `/article-details.html?id=${article._id}`;
            });

            // Добавляем созданные элементы в контейнер для статей
            cardCol.appendChild(cardElement);
            // cardCol.appendChild(favoriteText);
            articlesContainer.appendChild(cardCol);

            // Проверяем, если индекс кратен трем или это последний элемент, добавляем новую строку
            if ((index + 1) % 3 === 0 || index === articles.length - 1) {
                articlesContainer.appendChild(document.createElement('div'));
            }

            // Получаем контейнер для кнопок редактирования и удаления
            const editDeleteButtonsContainer = document.getElementById(`editDeleteButtons${article._id}`);
            // Отображаем кнопки редактирования и удаления в зависимости от роли пользователя
            editDeleteButtonsContainer.innerHTML = getEditDeleteButtons(article, user.role);
            // ИЗБРАННОЕ
            const favoriteTextContainer = document.getElementById(`favoriteText${article._id}`);
            // Отображаем кнопки редактирования и удаления в зависимости от роли пользователя
            favoriteTextContainer.innerHTML = getFavoriteTextButtons(user, article);
        });
    } catch (error) {
        console.error('Ошибка при получении статей:', error);
    }
});

async function loadCategoryNames(categoryIds) {
    try {
        const response = await fetch('/categories');
        const categories = await response.json();

        return categoryIds.map(categoryId => {
            const category = categories.find(category => category._id === categoryId);
            return category ? category.categoryName : 'Unknown';
        });
    } catch (error) {
        console.error('Ошибка при загрузке категорий:', error);
        return [];
    }
}

function getEditDeleteButtons(article, userRole) {
    const editButton = `
        <button type="button" class="btn btn-warning me-2" onclick="editArticle('${article._id}', event)">Редагувати</button>
    `;
    const deleteButton = `
        <button type="button" class="btn btn-danger" onclick="deleteArticle('${article._id}', event)">Видалити</button>
    `;

    if (userRole === 'admin') {
        return editButton + deleteButton;
    } else if (userRole === 'editor') {
        return editButton;
    } else {
        return ''; // Пустая строка, если пользователь не является админом или редактором
    }
}

function getFavoriteTextButtons(user, article) {
    const addFavoriteButton = `
        <button type="button" class="btn btn-success me-2" onclick="addToFavorites('${article}', event)">Додати в улюблене</button>
    `;
    const deleteFavoriteButton = `
        <button type="button" class="btn btn-danger" onclick="deleteFromFavorites('${article}', event)">Видалити з улюбленого</button>
    `;

    if (user.favoriteArticles.includes(article._id)) {
        return deleteFavoriteButton;
    } else {
        return addFavoriteButton;
    }
}
// Функция для редактирования статьи
function editArticle(articleId, event) {
    event.stopPropagation();
    window.location.href = `/editPostTiny.html?id=${articleId}`;
}

// Функция для удаления статьи
async function deleteArticle(articleId, event) {
    // Остановить распространение события клика, чтобы избежать перенаправления пользователя
    event.stopPropagation();
    try {
        const confirmation = confirm('Ви впевнені, що хочете видалити цю статтю?');
        if (!confirmation) return; // Если пользователь отменил удаление, ничего не делаем

        // Отправляем запрос на удаление статьи на сервер
        const response = await fetch(`/articles/${articleId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Ошибка удаления статьи');
        }

        // Получаем результат удаления изображения и файла PDF
        const result = await response.json();
        console.log(result.message); // Выводим сообщение об успешном удалении

        // Редиректим пользователя на главную страницу или на страницу со списком статей
        window.location.reload();
    } catch (error) {
        console.error('Ошибка при удалении статьи:', error);
        // Обработка ошибок удаления статьи
    }
}
async function loadCategories() {
    try {
        const response = await fetch('http://localhost:3000/categories');
        if (!response.ok) {
            throw new Error('Ошибка загрузки категорий');
        }
        const categories = await response.json();
        return categories;
    } catch (error) {
        console.error(error);
    }
}

// Функция для отображения списка категорий
async function showCategories() {
    const categoryDropdown = document.getElementById('categoryDropdown');
    // Загружаем категории
    const categories = await loadCategories();
    // Очищаем выпадающий список перед добавлением новых категорий
    categoryDropdown.innerHTML = '';
    // Добавляем категории в выпадающий список
    const categoryLink = document.createElement('a');
    categoryLink.href = `postsBootstrap.html?category=all`;
    categoryLink.textContent = "Всі категорії";
    categoryDropdown.appendChild(categoryLink);
    categories.forEach(category => {
        const categoryLink = document.createElement('a');
        categoryLink.href = `postsBootstrap.html?category=${category._id}`; // Предполагается, что у категории есть поле id
        categoryLink.textContent = category.categoryName; // Предполагается, что у категории есть поле categoryName
        categoryDropdown.appendChild(categoryLink);
    });
    // Отображаем выпадающий список
    categoryDropdown.style.display = 'block';
}

// Функция для скрытия списка категорий
function hideCategories() {
    const categoryDropdown = document.getElementById('categoryDropdown');
    // Скрываем выпадающий список
    categoryDropdown.style.display = 'none';
}
function goBack() {
    window.history.back();
}
// Функция для сортировки статей по имени (заголовку)
function sortByTitle(order) {
    if (order === 'asc') {
        articles.sort((a, b) => a.title.localeCompare(b.title));
    } else if (order === 'desc') {
        articles.sort((a, b) => b.title.localeCompare(a.title));
    }

    // Перерисовываем статьи в соответствии с выбранной сортировкой
    renderArticles();
}
// Функция для отображения статей
async function renderArticles() {
    const articlesContainer = document.getElementById('articlesContainer');
    articlesContainer.innerHTML = ''; // Очищаем контейнер перед добавлением новых статей

    for (let index = 0; index < articles.length; index++) {
        const article = articles[index];

        // Создаем элементы для отображения данных статьи
        const cardCol = document.createElement('div');
        cardCol.classList.add('col');

        const cardElement = document.createElement('div');
        cardElement.classList.add('card', 'mb-3');

        // Загружаем категории для текущей статьи
        const categoryNames = await loadCategoryNames(article.categories);

        cardElement.innerHTML = `
            <div class="row g-0">
                <div class="col-md-4">
                    <img src="${article.image}" class="img-fluid rounded-0 d-block" style="height: 270px; object-fit: cover;" alt="Article Image">
                </div>
                <div class="col-md-8">
                    <div class="card-body">
                        <h5 class="card-title text-start">${article.title}</h5>
                        <p class="card-text text-start">${article.textPlain.length > 130 ? article.textPlain.slice(0, 130) + '...' : article.textPlain}</p>
                        <p class="card-text text-start"><span class="bold-italic">Категорії:</span> ${categoryNames.join(', ')}</p>
                        <p class="card-text text-start"><small class="text-body-secondary">${article.creationTime}</small></p>
                        <!-- Кнопки "Редагувати" и "Видалити" -->
                        <p class="card-text text-start" id="editDeleteButtons${article._id}"></p>
                        <p class="card-text text-start" id="favoriteText${article}"></p>
                    </div>
                </div>
            </div>
        `;

        cardElement.addEventListener('click', () => {
            window.location.href = `/article-details.html?id=${article._id}`;
        });

        // Добавляем созданные элементы в контейнер для статей
        cardCol.appendChild(cardElement);
        articlesContainer.appendChild(cardCol);

        // Получаем контейнер для кнопок редактирования и удаления
        const editDeleteButtonsContainer = document.getElementById(`editDeleteButtons${article._id}`);
        // Отображаем кнопки редактирования и удаления в зависимости от роли пользователя
        editDeleteButtonsContainer.innerHTML = getEditDeleteButtons(article, user.role);
        // ИЗБРАННОЕ
        const favoriteTextContainer = document.getElementById(`favoriteText${article}`);
        // Отображаем кнопки редактирования и удаления в зависимости от роли пользователя
        favoriteTextContainer.innerHTML = getFavoriteTextButtons(user, article);
        
        // Проверяем, если индекс кратен трем или это последний элемент, добавляем новую строку
        if ((index + 1) % 3 === 0 || index === articles.length - 1) {
            articlesContainer.appendChild(document.createElement('div'));
        }
    }
}
// Функция для добавления статьи в избранное
async function addToFavorites(article, event) {
    event.stopPropagation(); // Останавливаем распространение события клика
    const articleId = article._id;

    try {
        // Отправляем запрос на сервер для добавления статьи в список избранных
        const response = await fetch(`/addToFavorites/${articleId}`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error('Ошибка при добавлении статьи в избранное');
        }

        // Получаем результат добавления избранной статьи
        const result = await response.json();
        console.log(result.message); // Выводим сообщение об успешном добавлении

        // Обновляем данные о пользователе и его избранных статьях
        user = await getUserRole();
        // Обновляем кнопки "Добавить в избранное" или "Удалить из избранного"
        const favoriteTextContainer = document.getElementById(`favoriteText${articleId}`);
        favoriteTextContainer.innerHTML = getFavoriteTextButtons(user, article._id); // Используем article._id
        //window.location.reload();
        console.log(user);
    } catch (error) {
        console.error('Ошибка при добавлении статьи в избранное:', error);
        // Обработка ошибок добавления статьи в избранное
    }
}

// Функция для удаления статьи из избранного
async function deleteFromFavorites(article, event) {
    event.stopPropagation(); // Останавливаем распространение события клика
    const articleId = article._id;

    try {
        // Отправляем запрос на сервер для удаления статьи из списка избранных
        const response = await fetch(`/deleteFromFavorites/${articleId}`, {
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error('Ошибка при удалении статьи из избранного');
        }

        // Получаем результат удаления избранной статьи
        const result = await response.json();
        console.log(result.message); // Выводим сообщение об успешном удалении

        // Обновляем данные о пользователе и его избранных статьях
        user = await getUserRole();
        // Обновляем кнопки "Добавить в избранное" или "Удалить из избранного"
        const favoriteTextContainer = document.getElementById(`favoriteText${articleId}`);
        favoriteTextContainer.innerHTML = getFavoriteTextButtons(user, article._id); // Используем article._id
        //window.location.reload();
        console.log(user);  
    } catch (error) {
        console.error('Ошибка при удалении статьи из избранного:', error);
        // Обработка ошибок удаления статьи из избранного
    }
}