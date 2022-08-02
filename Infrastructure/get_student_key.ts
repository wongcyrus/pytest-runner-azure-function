import * as fs from "fs";
import * as path from "path";
import { parse } from 'csv-parse/sync';
const json2csv = require('json2csv').parse;
const fields = ['id', 'firstName', 'lastName', 'email', 'key'];

const secrets = require("./secrets.json");

type Student = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

type StudentKey = Student & { key: string }
const csvFilePath = path.resolve(__dirname, 'student_list.csv');
const headers = ['id', 'firstName', 'lastName', 'email'];
const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

const students: Student[] = parse(fileContent, {
    delimiter: ',',
    columns: headers,
    from_line: 2
});
let i = 0;

const studentKeys: StudentKey[] = [];
for (let student of students) {
    const key: string = secrets.PyTestRunnerStack["SubscriptionKey_" + i];
    const studentKey = student as StudentKey;
    studentKey.key = key;
    studentKeys.push(studentKey);
    i++;
}

const csv = json2csv(studentKeys, fields);


fs.writeFileSync("student_key.csv", csv);
console.log("done!");