import { Uri, window, workspace } from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

import { config } from '../plugin/lib/config';

const jsonTpl =
`{
  "component": true
}
`;

/**
 * create a new miniprogram component
 * 
 * my-component
 *   |- my-component.json
 *   |- my-component.wxml
 *   |- my-component.js
 *   |- my-component.wxss
 */
export async function createMiniprogramComponent(folderPath: Uri): Promise<void> {
  const input = await window.showInputBox({
    prompt: "Enter the component name",
    validateInput: (s: string): string | undefined => s && s.trim() ? undefined : "Component name must not be empty.",
    placeHolder: "Example: avatar (will create 4 files, default is avatar.wxss avatar.json avatar.js avatar.wxml)",
    ignoreFocusOut: true,
  })
  const componentName = input?.trim();
  if (componentName) {
    fs.mkdir(path.join(folderPath.fsPath, componentName)).then(() => {
         Promise.all([
          fs.writeFile(path.join(folderPath.fsPath, componentName,  componentName + '.' + config.jsExtname), ""),
          fs.writeFile(path.join(folderPath.fsPath, componentName,  componentName + '.' + config.cssExtname), ""),
          fs.writeFile(path.join(folderPath.fsPath, componentName,  componentName + '.' + config.wxmlExtname), ""),
          fs.writeFile(path.join(folderPath.fsPath, componentName,  componentName + '.json'), jsonTpl)
        ]).then(() => {
          const openJsPath = Uri.file(path.join(folderPath.fsPath, componentName,  componentName + '.' + config.jsExtname));
          workspace.openTextDocument(openJsPath).then(doc => {
            if (doc) {
              window.showTextDocument(doc);
            }
          });
        }).catch(err => {
          window.showErrorMessage(`create file error: ${err}`)
        })
    }).catch(err => {
      window.showErrorMessage(`create folder error: ${err}`)
    })
  }
}
