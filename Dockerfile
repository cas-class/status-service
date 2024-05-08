FROM node:18.16.1-alpine3.18

# Папка приложения
ARG APP_DIR=/app

# Копируем проект в образ
ADD . ${APP_DIR}/

#Запуск приложения
WORKDIR ${APP_DIR}

RUN npm ci

RUN npm run build

CMD ["npm", "run", "start:prod"]
