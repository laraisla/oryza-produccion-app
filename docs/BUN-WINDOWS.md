# Instalar Bun en Windows (procedimiento)

Bun es el **gestor de dependencias y runtime oficial** del proyecto (ver
[`README.md`](../README.md) § «Ejecutar localmente»). `npm` no debe usarse: el
lockfile del repositorio es `bun.lock` y `package-lock.json` esta ignorado por
Git.

- Version fijada en `package.json` → `"packageManager": "bun@1.4.3"`.
- Version minima documentada → Bun **>= 1.4**.
- Requisitos de sistema: Windows 10 1809 (build 17763) o superior; x64 o ARM64.

> **Estado de verificación (21/10/2026).**
> Bun 1.4.3 fue instalado y verificado correctamente en Windows x64. En este
> proyecto, `bun install --frozen-lockfile` completo sin modificar `bun.lock`,
> los **37 tests** pasaron, `bunx tsc --noEmit` no reporto errores y
> `bun run build` genero el cliente, el SSR y el servidor Nitro con el preset
> `cloudflare-module`.

> Este documento describe el procedimiento. **No ejecuta ningun instalador.**
> Revisalo y ejecutalo vos cuando quieras.

---

## 1. Opcion recomendada — script oficial de Bun

Descarga el release publicado por Bun (no ejecuta nada de nuestro repo):

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

Para **fijar la version** 1.4.3 en lugar de `latest`, descargar el script y
pasarle el parametro `-Version` (el pipe directo no acepta parametros):

```powershell
irm bun.sh/install.ps1 -OutFile "$env:TEMP\install-bun.ps1"
& "$env:TEMP\install-bun.ps1" -Version 1.4.3
```

Parametros disponibles en `install.ps1`:

| Parametro | Efecto |
|---|---|
| `-Version <semver>` | Instala esa version exacta (ej. `1.4.3`) en lugar de `latest`. |
| `-ForceBaseline` | Fuerza el build `baseline` (para CPUs muy antiguas sin AVX2). |
| `-NoPathUpdate` | No agrega `bun.exe` al `%PATH%` del usuario. |

El script instala en `%USERPROFILE%\.bun\bin`, agrega esa carpeta al `%PATH%`
del usuario y registra Bun en la lista de programas instalados. **Cerrá y
volvé a abrir la terminal** (o el editor) para que el `PATH` se actualice.

## 2. Alternativa — `npm install -g bun`

Como `npm` ya esta instalado en esta maquina:

```powershell
npm install -g bun
```

Instala en el prefijo global de npm (`%APPDATA%\npm`).
Es el metodo mas simple, pero mezcla el binario de Bun con el arbol global de
npm.

## 3. Alternativa — `winget`

`winget` esta disponible en esta maquina:

```powershell
winget install Oven-sh.Bun
```

Verificar antes el identificador exacto con `winget search bun`.

## 4. Alternativa — instalacion manual

1. Descargar `bun-windows-x64.zip` (o `bun-windows-aarch64.zip`) desde la
   pagina de releases de Bun.
2. Extraer `bun.exe` a `%USERPROFILE%\.bun\bin`.
3. Agregar `%USERPROFILE%\.bun\bin` al `PATH` del usuario.

## 5. Verificacion

```powershell
bun --version          # debe imprimir 1.4.3
bun install --frozen-lockfile
bun run test
bunx tsc --noEmit
```

---

## Nota sobre `bun.lock` y Bun 1.4

El `bun.lock` de este repositorio esta en `lockfileVersion: 1` (generado con una
version anterior). Con Bun 1.4.3, `bun install --frozen-lockfile` completo sin
reescribirlo ni migrar el formato.

**Verificado (21/10/2026):** Bun 1.4.3 no modifico `bun.lock` en este proyecto.
Si una version futura migra el formato al ejecutar `bun install`, revisar el
diff antes de commitearlo.

Si al instalar aparece una migracion del lockfile:

1. Revisar el diff: `git diff -- bun.lock`
2. Si el cambio es solo la migracion de formato, commitearlo en la rama de
   trabajo (no en `main`).
3. Si `bun install --frozen-lockfile` falla pidiendo actualizar el lockfile,
   usar `bun install --lockfile-only` y revisar el diff antes de commitear.

## Nota sobre el guardia de cadena de suministro

`bunfig.toml` define `minimumReleaseAge = 86400`: Bun ignora versiones de
paquetes publicadas hace menos de 24 horas. Con `bun install --frozen-lockfile`
no aplica (no hay resolucion), pero ante un `bun install` normal puede
impedir instalar un release recien publicado. Es intencional.

Las exentas estan en `minimumReleaseAgeExcludes` (paquetes `@lovable.dev/*`).
Anyadir una excepcion requiere autorizacion explicita: revisar el comentario
del propio archivo antes de editarla.
