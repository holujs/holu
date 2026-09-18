## Prerequisites

If you haven't prepared the examples repository yet, you can do so:

```bash
git clone https://github.com/holujs/holu.git
cd holu
npm i
```

## Dynamically composing modules

Start from first terminal:

```bash
cd examples/07*
npm start
```

Check from second terminal:

```bash
curl -i localhost:3000

# 404 from the second module (not yet added)
curl -i localhost:3000/get-2

# Adding the second module
curl -i localhost:3000/add-2

# 200 from the second module
curl -i localhost:3000/get-2

# Adding the third module should fail
curl -i localhost:3000/add-3

# But the other modules continue to work
curl -i localhost:3000
curl -i localhost:3000/get-2

# Removing the second module
curl -i localhost:3000/del-2

# 404 from the second module (removed)
curl -i localhost:3000/get-2

# But the first module still works
curl -i localhost:3000
```
