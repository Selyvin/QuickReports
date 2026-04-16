(function () {
  const fileInput = document.getElementById('fileInput');
  const dropzone = document.getElementById('dropzone');
  const convertButton = document.getElementById('convertButton');

  if (!fileInput || !dropzone || !convertButton) return;

  let parsedRows = [];
  let headers = [];

  const getById = (id) => document.getElementById(id);
  const fileStatus = getById('fileStatus');
  const convertStatus = getById('convertStatus');
  const mappingCard = getById('mappingCard');
  const convertCard = getById('convertCard');
  const previewTable = getById('previewTable');

  const setStatus = (element, type, message) => {
    element.className = `status ${type}`;
    element.textContent = message;
  };

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    handleFile(event.dataTransfer?.files?.[0]);
  });

  fileInput.addEventListener('change', (event) => {
    handleFile(event.target.files?.[0]);
  });

  convertButton.addEventListener('click', convertAndDownload);

  function handleFile(file) {
    if (!file) return;
    if (!window.XLSX) {
      setStatus(fileStatus, 'error', '✗ Spreadsheet parser failed to load. Refresh and try again.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const workbook = window.XLSX.read(event.target.result, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (data.length < 2) throw new Error('File has no data rows.');

        headers = data[0].map((header) => String(header).trim());
        parsedRows = data.slice(1).filter((row) => row.some((cell) => cell !== ''));
        setStatus(fileStatus, 'success', `✓ Loaded "${file.name}" — ${parsedRows.length} transactions found across ${headers.length} columns.`);

        populateSelects();
        buildPreview();
        mappingCard.classList.remove('hidden');
        convertCard.classList.remove('hidden');
      } catch (error) {
        setStatus(fileStatus, 'error', `✗ ${error.message}`);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function populateSelects() {
    ['mapDate', 'mapAmount', 'mapDesc', 'mapMemo'].forEach((id) => {
      const select = getById(id);
      select.innerHTML = '<option value="">— select column —</option>';

      headers.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = header || `Column ${index + 1}`;
        select.appendChild(option);
      });
    });

    headers.forEach((header, index) => {
      const normalized = header.toLowerCase();
      if (/date|dt|posted/.test(normalized)) getById('mapDate').value = String(index);
      if (/amount|amt|debit|credit|sum/.test(normalized)) getById('mapAmount').value = String(index);

      if (/desc|payee|name|merchant|memo|narr/.test(normalized)) {
        if (!getById('mapDesc').value) getById('mapDesc').value = String(index);
        else if (!getById('mapMemo').value) getById('mapMemo').value = String(index);
      }
    });

    ['mapDate', 'mapAmount', 'mapDesc', 'mapMemo'].forEach((id) => {
      getById(id).addEventListener('change', buildPreview);
    });
  }

  function getCellValue(row, index) {
    if (index === '' || index === undefined) return '';
    return row[Number.parseInt(index, 10)] ?? '';
  }

  function parseDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof raw === 'number') {
      const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
      if (!Number.isNaN(date.getTime())) return date;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date) {
    if (!date) return '19000101';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }

  function escapeOfx(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function buildPreview() {
    const dateIndex = getById('mapDate').value;
    const amountIndex = getById('mapAmount').value;
    const descriptionIndex = getById('mapDesc').value;

    let html = '<thead><tr><th>Date</th><th>Amount</th><th>Description</th></tr></thead><tbody>';

    parsedRows.slice(0, 5).forEach((row) => {
      const date = parseDate(getCellValue(row, dateIndex));
      const amount = Number.parseFloat(String(getCellValue(row, amountIndex)).replace(/[^0-9.\-]/g, ''));
      const description = getCellValue(row, descriptionIndex);
      const amountClass = Number.isNaN(amount) ? '' : amount >= 0 ? 'amt-pos' : 'amt-neg';
      const previewAmount = Number.isNaN(amount) ? getCellValue(row, amountIndex) : amount.toFixed(2);
      const previewDescription = description || '<span style="color:#94a3b8">—</span>';

      html += `<tr><td>${date ? date.toLocaleDateString() : getCellValue(row, dateIndex)}</td><td class="${amountClass}">${previewAmount}</td><td>${previewDescription}</td></tr>`;
    });

    previewTable.innerHTML = `${html}</tbody>`;
  }

  function convertAndDownload() {
    const dateIndex = getById('mapDate').value;
    const amountIndex = getById('mapAmount').value;
    const descriptionIndex = getById('mapDesc').value;
    const memoIndex = getById('mapMemo').value;

    if (!dateIndex || !amountIndex) {
      setStatus(convertStatus, 'error', '✗ Please map at least the Date and Amount columns.');
      return;
    }

    const bankId = getById('bankId').value || '000000000';
    const acctId = getById('acctId').value || '0000000000';
    const acctType = getById('acctType').value;
    const currency = getById('currency').value;

    const transactions = [];
    parsedRows.forEach((row, index) => {
      const date = parseDate(getCellValue(row, dateIndex));
      const amount = Number.parseFloat(String(getCellValue(row, amountIndex)).replace(/[^0-9.\-]/g, ''));
      if (!date || Number.isNaN(amount)) return;

      transactions.push({
        date,
        amount,
        description: String(getCellValue(row, descriptionIndex) || '').trim(),
        memo: String(getCellValue(row, memoIndex) || '').trim(),
        fitid: `TXN${String(index + 1).padStart(6, '0')}`,
      });
    });

    if (!transactions.length) {
      setStatus(convertStatus, 'error', '✗ No valid rows found. Check column mapping.');
      return;
    }

    const dates = transactions.map((transaction) => transaction.date);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    const now = new Date();

    let qbo = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:UTF-8\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX>\n<SIGNONMSGSRSV1>\n<SONRS>\n<STATUS>\n<CODE>0</CODE>\n<SEVERITY>INFO</SEVERITY>\n</STATUS>\n<DTSERVER>${formatDate(now)}</DTSERVER>\n<LANGUAGE>ENG</LANGUAGE>\n</SONRS>\n</SIGNONMSGSRSV1>\n<BANKMSGSRSV1>\n<STMTTRNRS>\n<TRNUID>1001</TRNUID>\n<STATUS>\n<CODE>0</CODE>\n<SEVERITY>INFO</SEVERITY>\n</STATUS>\n<STMTRS>\n<CURDEF>${currency}</CURDEF>\n<BANKACCTFROM>\n<BANKID>${bankId}</BANKID>\n<ACCTID>${acctId}</ACCTID>\n<ACCTTYPE>${acctType}</ACCTTYPE>\n</BANKACCTFROM>\n<BANKTRANLIST>\n<DTSTART>${formatDate(minDate)}</DTSTART>\n<DTEND>${formatDate(maxDate)}</DTEND>\n`;

    transactions.forEach((transaction) => {
      const name = escapeOfx((transaction.description || 'TRANSACTION').substring(0, 32));
      const memo = escapeOfx((transaction.memo || transaction.description || '').substring(0, 64));
      qbo += `<STMTTRN>\n<TRNTYPE>${transaction.amount >= 0 ? 'CREDIT' : 'DEBIT'}</TRNTYPE>\n<DTPOSTED>${formatDate(transaction.date)}</DTPOSTED>\n<TRNAMT>${transaction.amount.toFixed(2)}</TRNAMT>\n<FITID>${transaction.fitid}</FITID>\n<NAME>${name}</NAME>\n<MEMO>${memo}</MEMO>\n</STMTTRN>\n`;
    });

    qbo += `</BANKTRANLIST>\n<LEDGERBAL>\n<BALAMT>0.00</BALAMT>\n<DTASOF>${formatDate(maxDate)}</DTASOF>\n</LEDGERBAL>\n</STMTRS>\n</STMTTRNRS>\n</BANKMSGSRSV1>\n</OFX>`;

    const downloadLink = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([qbo], { type: 'application/x-ofx' })),
      download: `transactions_${formatDate(now)}.qbo`,
    });

    downloadLink.click();
    URL.revokeObjectURL(downloadLink.href);
    setStatus(convertStatus, 'success', `✓ Done! ${transactions.length} transactions exported. Import the .QBO file via QuickBooks → File → Utilities → Import → Web Connect.`);
  }
})();