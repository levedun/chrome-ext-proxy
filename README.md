# chrome-ext-proxy

Простое Chrome-расширение (Manifest V3) для управления HTTP/SOCKS5-прокси: профили и быстрое переключение.

## Установка из релиза

1. Откройте [Releases](https://github.com/levedun/chrome-ext-proxy/releases) и скачайте `chrome-ext-proxy-vX.Y.Z.zip`.
2. Распакуйте архив в любую папку.
3. В Chrome откройте `chrome://extensions`, включите **Режим разработчика**.
4. Нажмите **Загрузить распакованное расширение** и выберите распакованную папку.

## Сборка из исходников

```bash
npm install
npm run build
```

Готовое расширение появится в папке `dist/`. Её же можно загрузить через «Загрузить распакованное расширение».

## Разработка

```bash
npm run watch
```

## Тесты

```bash
npm test
```

На каждый pull request GitHub Actions запускает `npm test` (см. `.github/workflows/ci.yml`).
