const fs = require('fs');

function fixDate(dateStr) {
    if (dateStr.trim() === 'Date') return '';
    
    let day, month, year;

    dateStr = dateStr.trim();
    
    if (dateStr.includes('-')) {
        [part1, part2, part3] = dateStr.split('-').map(x => x.trim());
    } else if (dateStr.includes('/')) {
        [part1, part2, part3] = dateStr.split('/').map(x => x.trim());
    } else {
        return dateStr;
    }

    if (part3) {
        if (part3.length === 4) {  
            day = part1;
            month = part2;
            year = part3;
        } else if (part3.length === 2) {  
            day = part1;
            month = part2;
            year = part3;
        } else if (part1.length === 4) {
            year = part1;
            month = part2;
            day = part3;
        }
    } else {
        return dateStr;
    }

    let monthNum = parseInt(month);
    if (monthNum > 12) {
        let temp = day;
        day = month;
        month = temp;
    }

    if (year && year.length === 2) {
        year = '20' + year;
    }
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    day = Math.min(Math.max(1, parseInt(day)), 31).toString().padStart(2, '0');
    month = Math.min(Math.max(1, parseInt(month)), 12).toString().padStart(2, '0');
    
    return `${day}-${month}-${year}`;
}

function parseCSV(content) {
    let rows = content.split('\n');
    return rows.map(row => {
        let cols = row.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
        return {
            col1: cols[0] || '',
            col2: cols[1] || '',
            col3: cols[2] || '',
            col4: cols[3] || '',
            col5: cols[4] || ''
        };
    });
}

function writeCSV(rows, headers, outputFile) {
    let headerRow = headers.map(h => h.title).join(',') + '\n';
    let dataRows = rows.map(row => {
        return headers.map(h => {
            let val = row[h.id];
            if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                val = `"${val.replace(/"/g, '""')}"`;
            }
            return val === undefined ? '' : val;
        }).join(',');
    }).join('\n');

    fs.writeFileSync(outputFile, headerRow + dataRows);
}
function getCurrency(description, isInternational) {
    if (!description || !isInternational) return '';

    let words = description.trim().split(/\s+/);
    let lastWord = words[words.length - 1];
    
    if (lastWord && lastWord.length === 3 && lastWord === lastWord.toUpperCase()) {
        return lastWord;
    }
    return '';
}

function getLocation(description, isInternational) {
    if (!description) return '';
    let words = description.trim().split(/\s+/);

    if (isInternational && words.length > 0) {
        let lastWord = words[words.length - 1];
        if (lastWord.length === 3 && lastWord === lastWord.toUpperCase()) {
            words.pop();
        }
    }
    let location = words.filter(word => word.length > 0).pop();
    return location ? location.toLowerCase() : '';
}

function findFormat(rows) {
    for (let row of rows.slice(0, 5)) {
        if (row.col1?.trim() === 'Transaction Details' && 
            row.col2?.trim() === 'Date') {
            return 'format4';
        }
        if (rows.some(r => r.col3 === 'International Transaction') &&
            rows.some(r => r.col2?.trim() === 'Transaction Description')) {
            return 'format3';
        }
        if (row.col3 === 'Domestic Transactions' || 
            row.col3 === 'International Transactions') {
            return 'format1';
        }
        if (row.col3 === 'Amount' && 
            row.col2?.trim() === 'Transaction Description') {
            return 'format2';
        }
    }
    return 'unknown';
}

function processTransaction(row, format, currentSection, currentName) {
    if (!row.col1) return null;

    let transactionData = null;
    let amountData;

    switch (format) {
        case 'format4':
            if (!row.col2 || !row.col3) return null;
            amountData = getAmount(row.col3);
            
            transactionData = {
                Date: fixDate(row.col2),
                'Transaction Description': row.col1,
                Debit: amountData.debit,
                Credit: amountData.credit,
                Currency: currentSection === 'domestic' ? 'INR' : getCurrency(row.col1, true),
                CardName: currentName,
                Transaction: currentSection,
                Location: getLocation(row.col1, currentSection === 'international')
            };
            break;

        case 'format1':
            if (!row.col4) return null;
            transactionData = {
                Date: fixDate(row.col1),
                'Transaction Description': row.col4,
                Debit: row.col2 ? parseFloat(row.col2.replace(/,/g, '')).toFixed(2) || '' : '',
                Credit: row.col3 ? parseFloat(row.col3.replace(/,/g, '')).toFixed(2) || '' : '',
                Currency: currentSection === 'domestic' ? 'INR' : getCurrency(row.col4, true),
                CardName: currentName,
                Transaction: currentSection,
                Location: getLocation(row.col4, currentSection === 'international')
            };
            break;

        case 'format2':
            if (!row.col2) return null;
            amountData = getAmount(row.col3);
            transactionData = {
                Date: fixDate(row.col1),
                'Transaction Description': row.col2,
                Debit: amountData.debit,
                Credit: amountData.credit,
                Currency: currentSection === 'domestic' ? 'INR' : getCurrency(row.col2, true),
                CardName: currentName,
                Transaction: currentSection,
                Location: getLocation(row.col2, currentSection === 'international')
            };
            break;

        case 'format3':
            if (!row.col2) return null;
            transactionData = {
                Date: fixDate(row.col1),
                'Transaction Description': row.col2.trim(),
                Debit: row.col3 ? parseFloat(row.col3.replace(/,/g, '')).toFixed(2) || '' : '',
                Credit: row.col4 ? parseFloat(row.col4.replace(/,/g, '')).toFixed(2) || '' : '',
                Currency: currentSection === 'domestic' ? 'INR' : getCurrency(row.col2, true),
                CardName: currentName,
                Transaction: currentSection,
                Location: getLocation(row.col2, currentSection === 'international')
            };
            break;
    }

    return transactionData;
}


function getAmount(amountStr) {
    if (!amountStr) return { debit: '', credit: '' };
    
    let cleanAmount = amountStr.trim();
    let isCredit = cleanAmount.toLowerCase().endsWith('cr');
    let amount = parseFloat(cleanAmount.replace(/cr$/i, '').replace(/,/g, ''));
    
    if (isNaN(amount)) return { debit: '', credit: '' };
    
    let formattedAmount = amount.toFixed(2);
    
    return {
        debit: isCredit ? '' : formattedAmount,
        credit: isCredit ? formattedAmount : ''
    };
}


async function standardizeStatement(inputFile, outputFile) {
    let content = fs.readFileSync(inputFile, 'utf-8');
    let rows = parseCSV(content);

    let format = findFormat(rows);

    let transactions = [];
    let currentSection = 'domestic';
    let currentName = '';

    for (let row of rows) {
        if (!row.col1 && !row.col2 && !row.col3 && !row.col4) continue;
        if (format === 'format4') {
            if (row.col1 === 'International Transactions' || 
                row.col2 === 'International Transactions' || 
                row.col3 === 'International Transactions') {
                currentSection = 'international';
                continue;
            }
            
            if (row.col1 === 'Domestic Transactions' || 
                row.col2 === 'Domestic Transactions' || 
                row.col3 === 'Domestic Transactions' ||
                row.col5 === 'Domestic Transactions') {
                currentSection = 'domestic';
                continue;
            }
        } else if (format === 'format1' && 
            (row.col3 === 'Domestic Transactions' || row.col3 === 'International Transactions')) {
            currentSection = row.col3 === 'International Transactions' ? 'international' : 'domestic';
            continue;
        } else if (format === 'format2' && 
            (row.col2 === 'Domestic Transactions' || row.col2 === 'International Transactions')) {
            currentSection = row.col2 === 'International Transactions' ? 'international' : 'domestic';
            continue;
        } else if (format === 'format3' && row.col3 === 'International Transaction') {
            currentSection = 'international';
            continue;
        }
        if (format === 'format1' && !row.col1 && !row.col2 && row.col3 && !row.col4) {
            currentName = row.col3.trim();
            continue;
        }

        if (format === 'format2' && !row.col1 && row.col2 && !row.col3) {
            currentName = row.col2.trim();
            continue;
        }

        if (format === 'format3' && !row.col1 && !row.col2 && row.col3 && !row.col4) {
            currentName = row.col3.trim();
            continue;
        }

        if (format === 'format4' && !row.col1 && row.col2?.trim()) {
            currentName = row.col2.trim();
            continue;
        }

        if (row.col1?.trim() === 'Transaction Details' || 
            row.col1?.trim() === 'Date' ||
            row.col2?.trim() === 'Date' ||
            row.col1?.trim() === 'Transaction Description' ||
            row.col2?.trim() === 'Transaction Description') {
            continue;
        }
        let transaction = processTransaction(row, format, currentSection, currentName);
        if (transaction) transactions.push(transaction);
    }

    let headers = [
        { id: 'Date', title: 'Date' },
        { id: 'Transaction Description', title: 'Transaction Description' },
        { id: 'Debit', title: 'Debit' },
        { id: 'Credit', title: 'Credit' },
        { id: 'Currency', title: 'Currency' },
        { id: 'CardName', title: 'CardName' },
        { id: 'Transaction', title: 'Transaction' },
        { id: 'Location', title: 'Location' }
    ];

    writeCSV(transactions, headers, outputFile);
}

let inputFile = process.argv[2];

if (!inputFile) {
    process.exit(1);
}

let outputFile = inputFile.replace(/Input/, 'Output');

if (outputFile === inputFile) {
    let parts = inputFile.split('.');
    outputFile = `${parts[0]}-Output.${parts[1]}`;
}

standardizeStatement(inputFile, outputFile)
    .catch(() => process.exit(1));