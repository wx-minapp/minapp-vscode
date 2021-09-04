/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { promisify } from 'util';
import * as fs from 'fs'

export const stat = promisify(fs.stat);

export const readdir = promisify(fs.readdir)

export const readFile = promisify(fs.readFile)

export const exists = promisify(fs.exists)
