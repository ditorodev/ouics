import { BunFile, Import } from 'bun';
import * as fs from 'fs';
import * as path from 'path';

const componentsDir = './components';
const components = fs.readdirSync(componentsDir);

if (!fs.existsSync('./dist')){
    fs.mkdirSync('./dist');
}

async function getDependencies(file: BunFile) {
    const transpiler = new Bun.Transpiler({
      loader: 'tsx',
    });
  
    const code = await file.text();
  
    const result = transpiler.scanImports(code);
  
    const tsconfig = await Bun.file('./tsconfig.json').json();
    const aliases = Object.keys(tsconfig.compilerOptions.paths || {});
    const nodeModulesImports = result.filter(importObj => {
      return !importObj.path.startsWith('.') && !aliases.includes(importObj.path.split('/')[0]);
    });
  
    return nodeModulesImports;
}

async function getLocalDependencies(file: BunFile) {
    const transpiler = new Bun.Transpiler({
      loader: 'tsx',
    });
  
    const code = await file.text();
  
    const result = transpiler.scanImports(code);
  
    const tsconfig = await Bun.file('./tsconfig.json').json();
    const aliases = Object.keys(tsconfig.compilerOptions.paths || {});
    const nodeModulesImports = result.filter(importObj => {
      return importObj.path.startsWith('.') || aliases.includes(importObj.path.split('/')[0]);
    });
  
    return nodeModulesImports;
}

const componentsData = components.map(async component => {
  const componentDir = path.join(componentsDir, component);
  let styles: string[] = [];
  if (fs.existsSync(componentDir) && fs.lstatSync(componentDir).isDirectory()) {
    styles = fs.readdirSync(componentDir).filter(file => fs.lstatSync(path.join(componentDir, file)).isDirectory());
  }
  const componentFile = Bun.file(componentDir);

  const dependencies: string[] = (await getDependencies(componentFile)).map(i => i.path);
  const files: string[] = [
    componentDir,    
    // ...(await getLocalDependencies(componentFile)).map(i => i.path), TODO: Is this needed? I think not, or maybe yes so we dont have to resolve multiple files
  ];

  return {
    name: path.basename(component, path.extname(component)),
    path: path.basename(component),
    dependencies,
    styles,
    files
  };
});

const _componentsData = await Promise.allSettled(componentsData);

const distComponentsJSON = Bun.file('./dist/components.json').writer()
distComponentsJSON.write(JSON.stringify(_componentsData.map(p => p.status === 'fulfilled' ? p.value : undefined).filter(Boolean), null, 2));
distComponentsJSON.end();

_componentsData.forEach(async componentData => {
    if(componentData.status == 'fulfilled') {
        const componentFiles = componentData.value.files.map(async file => {
            const filePath = path.join(componentsDir, componentData.value.path);
            const content = await Bun.file(filePath).text();
        
            return {
                name: file,
                content
            };
        });
        const componentJson = {
          name: componentData.value.name,
          dependencies: componentData.value.dependencies,
          files: (await Promise.allSettled(componentFiles))
                    .map(o => {
                        if (o.status === 'fulfilled') {
                            return o.value
                        } else {
                            throw new Error(`Failed to process file: ${o.reason }`);                            
                        }
                    })
        };
      
        const distComponentFile = Bun.file(`./dist/${componentData.value.name}.json`).writer();
        distComponentFile.write(JSON.stringify(componentJson, null, 2));
        distComponentFile.end();
    }
});


console.log("🥐 Its done! OkUIComponentService has finished generating your component registry")