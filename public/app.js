// actual-fints connector - SPA Frontend Logic
document.addEventListener('DOMContentLoaded', () => {

   // --- STATE ---
   let currentBanks = [];
   let syncIntervalId = null;
   let lastCronSyncLog = '';

   // Cron Log Selectors
   const cronLogModal = document.getElementById('cron-log-modal');
   const cronLogContent = document.getElementById('cron-log-content');
   const cronLogCloseBtn = document.getElementById('cron-log-close-btn');
   const cronLogOkBtn = document.getElementById('cron-log-ok-btn');

   // --- SELECTORS ---
   const tabs = document.querySelectorAll('.nav-tab');
   const tabContents = document.querySelectorAll('.tab-content');
   const startSyncBtn = document.getElementById('start-sync-btn');
   const gitUpdateBtn = document.getElementById('git-update-btn');
   const syncRunningSpinner = document.getElementById('sync-running-spinner');
   const syncInfoMsg = document.getElementById('sync-info-msg');

   // Sync Results Table Elements
   const syncResultsCard = document.getElementById('sync-results-card');
   const closeSyncResultsBtn = document.getElementById('close-sync-results-btn');
   const syncResultsTableBody = document.getElementById('sync-results-table-body');

   // Status Elements
   const statusActualIcon = document.getElementById('status-actual-icon');
   const statusActualText = document.getElementById('status-actual-text');
   const statusActualCircle = document.getElementById('status-actual-circle');
   const statusDbIcon = document.getElementById('status-db-icon');
   const statusDbText = document.getElementById('status-db-text');
   const statusDbCircle = document.getElementById('status-db-circle');
   const statusSyncIcon = document.getElementById('status-sync-icon');
   const statusSyncText = document.getElementById('status-sync-text');
   const statusSyncCircle = document.getElementById('status-sync-circle');

   const configMasterKey = document.getElementById('config-master-key');

   // Bank Page
   const bankCardsContainer = document.getElementById('bank-cards-container');
   const addBankBtn = document.getElementById('add-bank-btn');

   // Logs Page
   const terminalLogContent = document.getElementById('terminal-log-content');
   const refreshLogsBtn = document.getElementById('refresh-logs-btn');
   const clearLogsUiBtn = document.getElementById('clear-logs-ui-btn');

   // Theme Settings selectors
   const settingsSystemTheme = document.getElementById('settings-system-theme');
   const themeBtnDark = document.getElementById('theme-btn-dark');
   const themeBtnLight = document.getElementById('theme-btn-light');
   const manualThemeGroup = document.getElementById('manual-theme-group');

   // Modal
   const bankModal = document.getElementById('bank-modal');
   const bankForm = document.getElementById('bank-form');
   const modalTitle = document.getElementById('modal-title');
   const modalCloseBtn = document.getElementById('modal-close-btn');
   const modalCancelBtn = document.getElementById('modal-cancel-btn');
   const modalEditMode = document.getElementById('bank-modal-edit-mode');
   const modalAddAccountRow = document.getElementById('modal-add-account-row');
   const modalAccountRowsContainer = document.getElementById('modal-account-rows-container');

   // Inputs
   const inputName = document.getElementById('bank-input-name');
   const inputUrl = document.getElementById('bank-input-url');
   const inputBlz = document.getElementById('bank-input-blz');
   const inputLogin = document.getElementById('bank-input-login');
   const inputPin = document.getElementById('bank-input-pin');

   // Push Notification Selectors
    const ntfyTopicInput = document.getElementById('ntfy-topic-input');
    const ntfyServerInput = document.getElementById('ntfy-server-input');
    const btnShowTopic = document.getElementById('btn-show-topic');
    const btnGenerateTopic = document.getElementById('btn-generate-topic');
    const saveNtfyBtn = document.getElementById('save-ntfy-btn');
    const ntfySetupGuideRead = document.getElementById('ntfy-setup-guide-read');

    const ntfyReadView = document.getElementById('ntfy-read-view');
    const ntfyEditView = document.getElementById('ntfy-edit-view');
    const ntfyTopicDisplay = document.getElementById('ntfy-topic-display');
    const ntfyServerDisplay = document.getElementById('ntfy-server-display');
    const btnCopyTopic = document.getElementById('btn-copy-topic');
    const btnCopyServer = document.getElementById('btn-copy-server');
    const btnSwitchToEdit = document.getElementById('btn-switch-to-edit');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');
    const btnTestPush = document.getElementById('btn-test-push');

    // PWA Web-Push Selectors
    const settingsPushStatus = document.getElementById('settings-push-status');
    const pwaPushIosNote = document.getElementById('pwa-push-ios-note');
    const pwaPushDevicesContainer = document.getElementById('pwa-push-devices-container');
    const settingsPushDeviceName = document.getElementById('settings-push-device-name');
    const btnPwaPushSubscribe = document.getElementById('btn-pwa-push-subscribe');
    const btnPwaPushUnsubscribe = document.getElementById('btn-pwa-push-unsubscribe');
    const btnPwaPushTest = document.getElementById('btn-pwa-push-test');
    const pwaPushUnregisteredActions = document.getElementById('pwa-push-unregistered-actions');
    const pwaPushRegisteredActions = document.getElementById('pwa-push-registered-actions');

   // Hide running spinner initially
   syncRunningSpinner.style.visibility = 'hidden';

    // Wire up close button for sync results
    if (closeSyncResultsBtn) {
       closeSyncResultsBtn.addEventListener('click', () => {
          syncResultsCard.style.display = 'none';
       });
    }

    // Wire up collapsible date options
    const toggleDateOptions = document.getElementById('toggle-date-options');
    const dateOptionsContainer = document.getElementById('date-options-container');
    const dateToggleIcon = document.getElementById('date-toggle-icon');

    if (toggleDateOptions && dateOptionsContainer) {
       toggleDateOptions.addEventListener('click', (e) => {
          e.preventDefault();
          const isHidden = dateOptionsContainer.style.display === 'none';
          if (isHidden) {
             dateOptionsContainer.style.display = 'block';
             if (dateToggleIcon) dateToggleIcon.style.transform = 'rotate(180deg)';
             toggleDateOptions.style.borderColor = 'var(--accent-primary)';
          } else {
             dateOptionsContainer.style.display = 'none';
             if (dateToggleIcon) dateToggleIcon.style.transform = 'rotate(0deg)';
             toggleDateOptions.style.borderColor = 'var(--input-border)';
          }
       });
    }

   // --- TOAST NOTIFICATIONS ---
   const showToast = (message, type = 'success') => {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      
      let icon = 'info';
      if (type === 'success') icon = 'check_circle';
      if (type === 'error') icon = 'error';
      
      toast.innerHTML = `<span class="material-icons">${icon}</span> <span>${message}</span>`;
      container.appendChild(toast);

      setTimeout(() => {
         toast.style.opacity = '0';
         toast.style.transform = 'translateY(10px)';
         toast.style.transition = 'opacity 0.3s, transform 0.3s';
         setTimeout(() => toast.remove(), 300);
      }, 4000);
   };

   // --- SPA ROUTING / TAB SWITCHING ---
   tabs.forEach(tab => {
      tab.addEventListener('click', () => {
         const targetTab = tab.getAttribute('data-tab');

         // Update active nav button
         tabs.forEach(t => t.classList.remove('active'));
         document.querySelectorAll(`.nav-tab[data-tab="${targetTab}"]`).forEach(t => t.classList.add('active'));

         // Show target content
         tabContents.forEach(content => {
            content.classList.remove('active');
            if (content.id === `${targetTab}-tab`) {
               content.classList.add('active');
            }
         });

         // Custom tab hooks
         if (targetTab === 'banks') {
            loadBanks();
         } else if (targetTab === 'logs') {
            loadLogs();
         } else if (targetTab === 'dashboard' || targetTab === 'settings') {
            loadStatus();
            if (targetTab === 'settings') {
               loadPushStatus();
               loadPushSubscriptions();
            }
         }
      });
   });

   // --- API INTEGRATION ---

    // 1. Fetch System Status
    const loadStatus = async () => {
       try {
          const res = await fetch('/api/status');
          const data = await res.json();
 
          // Update Actual Budget Badge
          if (data.actualBudgetConfigured) {
             if (statusActualCircle) statusActualCircle.className = 'status-circle success';
             statusActualIcon.textContent = 'check_circle';
             statusActualText.textContent = 'Bereit';
          } else {
             if (statusActualCircle) statusActualCircle.className = 'status-circle danger';
             statusActualIcon.textContent = 'error';
             statusActualText.textContent = 'Konfig-Fehler';
          }
 
          // Mapped banks badge
          statusDbText.textContent = `${data.bankCount} Banken (${data.accountCount} Konten)`;
          if (data.bankCount > 0) {
             if (statusDbCircle) statusDbCircle.className = 'status-circle success';
             statusDbIcon.textContent = 'account_balance';
          } else {
             if (statusDbCircle) statusDbCircle.className = 'status-circle warning';
             statusDbIcon.textContent = 'help_outline';
          }
 
          // Last sync badge
          if (data.lastSync) {
             const lastSyncDate = new Date(data.lastSync);
             statusSyncText.textContent = lastSyncDate.toLocaleString('de-DE');
          } else {
             statusSyncText.textContent = 'Nie';
          }
 
          // Populate System info block
          configMasterKey.textContent = data.masterKeyConfigured ? 'Konfiguriert (AES-GCM)' : 'Fehlt';
          configMasterKey.style.color = data.masterKeyConfigured ? 'var(--success)' : 'var(--danger)';

          // Populate Cron Sync details
          const cronScheduleDisplay = document.getElementById('cron-schedule-display');
          const cronLastDisplay = document.getElementById('cron-last-display');
          const cronNextDisplay = document.getElementById('cron-next-display');
          const btnViewCronLog = document.getElementById('btn-view-cron-log');

          if (cronScheduleDisplay) {
             cronScheduleDisplay.textContent = data.cronSchedule || '59 7-23/4 * * 1-6';
          }

          if (cronLastDisplay) {
             if (data.lastCronSync) {
                const d = new Date(data.lastCronSync);
                cronLastDisplay.textContent = isNaN(d.getTime()) ? data.lastCronSync : d.toLocaleString('de-DE');
                if (btnViewCronLog) btnViewCronLog.style.display = 'flex';
             } else {
                cronLastDisplay.textContent = 'Nie';
                if (btnViewCronLog) btnViewCronLog.style.display = 'none';
             }
          }

          if (cronNextDisplay) {
             if (data.nextCronSync) {
                const d = new Date(data.nextCronSync);
                cronNextDisplay.textContent = isNaN(d.getTime()) ? data.nextCronSync : d.toLocaleString('de-DE');
             } else {
                cronNextDisplay.textContent = 'Nicht geplant';
             }
          }

          lastCronSyncLog = data.lastCronSyncLog || '';
 
          // Actual Budget settings are loaded separately by loadAbConfig()

       } catch (err) {
          console.error('Error fetching status:', err);
          showToast('System-Status konnte nicht geladen werden.', 'error');
       }
    };

   // 2. Fetch Bank list
   const loadBanks = async () => {
      bankCardsContainer.innerHTML = '<p style="color:var(--text-secondary);">Lade Banken-Konfigurationen...</p>';
      try {
         const res = await fetch('/api/banks');
         if (!res.ok) throw new Error('API request failed');
         currentBanks = await res.json();

         if (currentBanks.length === 0) {
            bankCardsContainer.innerHTML = `
               <div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                  <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Bislang sind keine Banken konfiguriert.</p>
                  <button class="btn" style="margin: 0 auto;" onclick="document.getElementById('add-bank-btn').click()">
                     <span class="material-icons btn-icon">add</span> Erste Bank einrichten
                  </button>
               </div>
            `;
            return;
         }

         bankCardsContainer.innerHTML = '';
         currentBanks.forEach(bank => {
            const card = document.createElement('div');
            card.className = 'glass-card bank-card';

            let accountsHtml = '';
            if (bank.accounts && bank.accounts.length > 0) {
               accountsHtml = `
                  <div class="accounts-sublist">
                     <div class="accounts-sublist-title">Mapped Accounts (${bank.accounts.length})</div>
                     ${bank.accounts.map(acc => `
                        <div class="account-item">
                           <span class="account-iban">${maskIban(acc.iban)}</span>
                           <span class="account-actual-name">${acc.actualAccountName}</span>
                        </div>
                     `).join('')}
                  </div>
               `;
            } else {
               accountsHtml = `
                  <div class="accounts-sublist">
                     <div class="accounts-sublist-title" style="color: var(--warning);">Keine Konten mapped</div>
                  </div>
               `;
            }

            card.innerHTML = `
                <div class="bank-card-top">
                   <div class="bank-card-title">
                      <h3>${escapeHtml(bank.name)}</h3>
                      <span class="material-icons" style="color: var(--success); font-size: 1.25rem;">check_circle</span>
                   </div>
                  <div class="bank-meta">
                     <span class="bank-meta-label">URL:</span>
                     <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(bank.fints.url)}</span>
                     <span class="bank-meta-label">BLZ:</span>
                     <span>${escapeHtml(bank.fints.blz)}</span>
                     <span class="bank-meta-label">Login:</span>
                     <span>${escapeHtml(bank.fints.login)}</span>
                  </div>
                  ${accountsHtml}
               </div>
               <div class="bank-card-actions">
                  <button class="btn secondary edit-btn" style="flex:1; padding:0.4rem;" data-name="${escapeHtml(bank.name)}">Bearbeiten</button>
                  <button class="btn danger delete-btn" style="padding:0.4rem 0.8rem;" data-name="${escapeHtml(bank.name)}">Löschen</button>
               </div>
            `;
            bankCardsContainer.appendChild(card);
         });

         // Bind actions to dynamically injected buttons
         document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
               const name = e.target.getAttribute('data-name');
               openEditModal(name);
            });
         });

         document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
               const name = e.target.getAttribute('data-name');
               deleteBank(name);
            });
         });

      } catch (err) {
         console.error('Error fetching banks:', err);
         bankCardsContainer.innerHTML = '<p style="color:var(--danger);">Fehler beim Laden der Bankkonfigurationen.</p>';
      }
   };

   // 3. Delete Bank
   const deleteBank = async (name) => {
      if (!confirm(`Möchtest du die Bank "${name}" und alle zugehörigen Kontomappings wirklich löschen?`)) {
         return;
      }

      try {
         const res = await fetch(`/api/banks/${encodeURIComponent(name)}`, { method: 'DELETE' });
         const data = await res.json();
         if (data.success) {
            showToast(`Bank "${name}" wurde erfolgreich gelöscht.`);
            loadBanks();
         } else {
            showToast('Löschen fehlgeschlagen.', 'error');
         }
      } catch (err) {
         console.error('Error deleting bank:', err);
         showToast('Fehler beim Löschvorgang.', 'error');
      }
   };

   // 4. Fetch Logs
   const loadLogs = async () => {
      try {
         const res = await fetch('/api/logs');
         const data = await res.json();
         terminalLogContent.textContent = data.logs || 'Noch keine Protokolle vorhanden.';
         // Scroll to bottom of terminal content
         terminalLogContent.scrollTop = terminalLogContent.scrollHeight;
      } catch (err) {
         console.error('Error loading logs:', err);
         terminalLogContent.textContent = 'Fehler beim Abrufen der Logs.';
      }
   };

   // --- SYNC OPERATION ---
   startSyncBtn.addEventListener('click', async () => {
      const startVal = document.getElementById('sync-start-date').value;
      const endVal = document.getElementById('sync-end-date').value;

      startSyncBtn.disabled = true;
      syncRunningSpinner.style.visibility = 'visible';
      syncInfoMsg.textContent = 'Verbindung zu FinTS-Servern wird aufgebaut...';
      showToast('FinTS Synchronisation gestartet...', 'info');

      // Hide previous results
      syncResultsCard.style.display = 'none';

      try {
         const res = await fetch('/api/transactions/load', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start: startVal, end: endVal }),
         });

         const data = await res.json();

         if (res.ok) {
            showToast('Synchronisation erfolgreich abgeschlossen!');
            syncInfoMsg.textContent = 'Umsätze geladen und importiert.';
            loadStatus();
            
            // Display transactions visualization
            if (data.results && data.results.length > 0) {
               syncResultsTableBody.innerHTML = '';
               let txInjected = 0;
               
               data.results.forEach(accResult => {
                  if (accResult.transactions && accResult.transactions.length > 0) {
                     accResult.transactions.forEach(tx => {
                        const row = document.createElement('tr');
                        row.className = 'sync-tx-row';
                        
                        const isCredit = tx.amount > 0;
                        const amountClass = isCredit ? 'credit' : 'debit';
                        const badgeClass = tx.status === 'added' ? 'added' : 'ignored';
                        const badgeText = tx.status === 'added' ? 'Hinzugefügt' : 'Bereits importiert';
                        
                        row.innerHTML = `
                           <td class="sync-tx-date">${escapeHtml(formatDate(tx.date))}</td>
                           <td class="sync-tx-account">${escapeHtml(accResult.account)}</td>
                           <td class="sync-tx-payee" title="${escapeHtml(tx.payee)}">${escapeHtml(tx.payee)}</td>
                           <td class="sync-tx-amount ${amountClass}">${formatAmount(tx.amount)}</td>
                           <td class="sync-tx-status">
                              <span class="status-badge-inline ${badgeClass}">${badgeText}</span>
                           </td>
                        `;
                        syncResultsTableBody.appendChild(row);
                        txInjected++;
                     });
                  }
               });

               if (txInjected > 0) {
                  syncResultsCard.style.display = 'block';
                  // Smoothly scroll to the results table
                  setTimeout(() => {
                     syncResultsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }, 100);
               }
            }

         } else {
            showToast(data.error || 'Fehler beim Synchronisieren.', 'error');
            syncInfoMsg.textContent = 'Synchronisationsfehler.';
         }
      } catch (err) {
         console.error('Sync error:', err);
         showToast('Netzwerk- oder Serverfehler beim Sync.', 'error');
         syncInfoMsg.textContent = 'Netzwerkfehler.';
      } finally {
         startSyncBtn.disabled = false;
         syncRunningSpinner.style.visibility = 'hidden';
      }
   });

   // --- GIT UPDATE OPERATION ---
   gitUpdateBtn.addEventListener('click', async () => {
      if (!confirm('Möchtest du das neueste Git Pull Update ziehen und die API neu starten?')) return;

      gitUpdateBtn.disabled = true;
      showToast('Git Pull Update wird ausgeführt...', 'info');

      try {
         const res = await fetch('/api/update/config', { method: 'PUT' });
         const data = await res.json();

         if (res.ok) {
            showToast('Git Update erfolgreich. Der API-Dienst startet im Hintergrund neu.', 'success');
            // Reload status after small delay
            setTimeout(() => {
               loadStatus();
               gitUpdateBtn.disabled = false;
            }, 6000);
         } else {
            showToast(data.error || 'Update fehlgeschlagen.', 'error');
            gitUpdateBtn.disabled = false;
         }
      } catch (err) {
         console.error('Update error:', err);
         showToast('Serverfehler bei Update-Ausführung. Möglicherweise startet der Dienst neu.', 'warning');
         setTimeout(() => {
            gitUpdateBtn.disabled = false;
         }, 5000);
      }
   });

   let actualAccounts = [];
   const loadActualAccounts = async () => {
      try {
         const res = await fetch('/api/budget/accounts');
         if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.accounts)) {
               actualAccounts = data.accounts.filter(acc => !acc.closed);
            }
         }
      } catch (err) {
         console.error('Error fetching Actual Budget accounts:', err);
      }
   };

   // --- MODAL ACCOUNT ROWS BUILDER ---
   const addAccountRow = (iban = '', actualName = '') => {
      const row = document.createElement('div');
      row.className = 'account-input-row';
      
      let optionsHtml = '<option value="">-- Konto auswählen --</option>';
      let foundSelected = false;
      
      actualAccounts.forEach(acc => {
         const selected = acc.name === actualName ? 'selected' : '';
         if (selected) foundSelected = true;
         optionsHtml += `<option value="${escapeHtml(acc.name)}" ${selected}>${escapeHtml(acc.name)}</option>`;
      });
      
      if (actualName && !foundSelected) {
         optionsHtml += `<option value="${escapeHtml(actualName)}" selected>${escapeHtml(actualName)} (nicht in Actual gefunden)</option>`;
      }

      row.innerHTML = `
         <input type="text" class="input-field modal-account-iban" required placeholder="DE12..." value="${iban}" style="font-family:var(--font-mono); font-size:0.85rem;">
         <select class="input-field modal-account-actual-name" required style="font-size:0.85rem;">
            ${optionsHtml}
         </select>
         <button class="btn danger remove-account-row-btn" type="button" style="padding:0.6rem; font-size:0.9rem;">✕</button>
      `;
      modalAccountRowsContainer.appendChild(row);

      row.querySelector('.remove-account-row-btn').addEventListener('click', () => {
         row.remove();
      });
   };

   modalAddAccountRow.addEventListener('click', () => addAccountRow());

   // --- MODAL ACTIONS ---
   const openAddModal = async () => {
      modalTitle.textContent = 'Neue Bank hinzufügen';
      modalEditMode.value = '';
      
      // Clear inputs
      inputName.value = '';
      inputName.disabled = false;
      inputUrl.value = '';
      inputBlz.value = '';
      inputLogin.value = '';
      inputLogin.placeholder = 'Benutzername/Kontonr';
      inputLogin.required = true;
      inputPin.value = '';
      inputPin.placeholder = 'Passwort/PIN';
      inputPin.required = true;
      modalAccountRowsContainer.innerHTML = '';
      
      // Load accounts in background or wait for them
      await loadActualAccounts();
      
      // Default to 1 empty mapping row
      addAccountRow();

      bankModal.classList.add('show');
   };

   const openEditModal = async (name) => {
      const bank = currentBanks.find(b => b.name === name);
      if (!bank) return;

      modalTitle.textContent = `Bank bearbeiten: ${bank.name}`;
      modalEditMode.value = bank.name;

      inputName.value = bank.name;
      inputName.disabled = true; // Cannot edit core primary key bank name easily in SQLite store here
      inputUrl.value = bank.fints.url;
      inputBlz.value = bank.fints.blz;
      // Leave Login blank unless user wants to change it
      inputLogin.value = '';
      inputLogin.placeholder = '●●●●●●●● (Unverändert lassen)';
      inputLogin.required = false;
      
      // Leave PIN blank unless user wants to change it
      inputPin.value = '';
      inputPin.placeholder = '●●●●●●●● (Unverändert lassen)';
      inputPin.required = false;

      // Load accounts
      await loadActualAccounts();

      // Populate accounts
      modalAccountRowsContainer.innerHTML = '';
      if (bank.accounts && bank.accounts.length > 0) {
         bank.accounts.forEach(acc => {
            addAccountRow(acc.iban, acc.actualAccountName);
         });
      } else {
         addAccountRow();
      }

      bankModal.classList.add('show');
   };

   const closeModal = () => {
      bankModal.classList.remove('show');
   };

   addBankBtn.addEventListener('click', openAddModal);
   modalCloseBtn.addEventListener('click', closeModal);
   modalCancelBtn.addEventListener('click', closeModal);

   // Close modal on click outside
   bankModal.addEventListener('click', (e) => {
      if (e.target === bankModal) closeModal();
   });

   // --- FORM SUBMIT (CREATE / UPDATE) ---
   bankForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const editModeName = modalEditMode.value;
      const isEdit = !!editModeName;

      // Collect accounts
      const accounts = [];
      const rows = modalAccountRowsContainer.querySelectorAll('.account-input-row');
      rows.forEach(row => {
         const iban = row.querySelector('.modal-account-iban').value.trim().replace(/\s/g, '').toUpperCase();
         const actualAccountName = row.querySelector('.modal-account-actual-name').value.trim();
         if (iban && actualAccountName) {
            accounts.push({ iban, actualAccountName });
         }
      });

      const bodyData = {
         name: inputName.value.trim(),
         url: inputUrl.value.trim(),
         blz: inputBlz.value.trim(),
         login: inputLogin.value.trim() || '●●●●●●●●', // If blank in edit mode, keeps original
         pin: inputPin.value || '●●●●●●●●', // If blank in edit mode, keeps original
         accounts
      };

      try {
         let res;
         if (isEdit) {
            res = await fetch(`/api/banks/${encodeURIComponent(editModeName)}`, {
               method: 'PUT',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(bodyData),
            });
         } else {
            res = await fetch('/api/banks', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(bodyData),
            });
         }

         const data = await res.json();

         if (res.ok) {
            showToast(isEdit ? `Bank "${bodyData.name}" aktualisiert.` : `Bank "${bodyData.name}" hinzugefügt.`);
            closeModal();
            loadBanks();
            loadStatus();
         } else {
            showToast(data.error || 'Fehler beim Speichern der Bankdaten.', 'error');
         }
      } catch (err) {
         console.error('Error saving bank:', err);
         showToast('Serverfehler beim Speichern.', 'error');
      }
   });

   const modalTestBtn = document.getElementById('modal-test-btn');
   if (modalTestBtn) {
      modalTestBtn.addEventListener('click', async (e) => {
         e.preventDefault();

         const editModeName = modalEditMode.value;
         const url = inputUrl.value.trim();
         const blz = inputBlz.value.trim();
         const login = inputLogin.value.trim() || '●●●●●●●●';
         const pin = inputPin.value || '●●●●●●●●';

         if (!url || !blz) {
            showToast('URL und BLZ sind erforderlich zum Testen.', 'error');
            return;
         }

         try {
            modalTestBtn.disabled = true;
            modalTestBtn.innerHTML = '<span class="material-icons spinning-icon" id="modal-test-icon">sync</span> Teste...';

            const res = await fetch('/api/banks/test', {
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json'
               },
               body: JSON.stringify({
                  name: editModeName,
                  url,
                  blz,
                  login,
                  pin
               })
            });

            const data = await res.json();

            if (res.ok && data.success) {
               const accountCount = data.accounts ? data.accounts.length : 0;
               let successMsg = `Erfolgreich mit Bank verbunden! ${accountCount} Konten gefunden.`;
               if (accountCount > 0) {
                  const ibans = data.accounts.map(acc => maskIban(acc.iban)).join(', ');
                  successMsg += ` (IBANs: ${ibans})`;
               }
               showToast(successMsg, 'success');
            } else {
               showToast(data.error || 'Verbindung zum FinTS-Server fehlgeschlagen.', 'error');
            }
         } catch (err) {
            console.error('Error testing bank connection:', err);
            showToast('Netzwerk- oder Serverfehler beim Verbindungstest.', 'error');
         } finally {
            modalTestBtn.disabled = false;
            modalTestBtn.innerHTML = '<span class="material-icons" style="font-size:1.15rem;" id="modal-test-icon">sync_alt</span> Verbindung testen';
         }
      });
   }

    // --- REFRESH LOGS BUTTONS ---
    refreshLogsBtn.addEventListener('click', loadLogs);
    clearLogsUiBtn.addEventListener('click', () => {
       terminalLogContent.textContent = 'Ansicht geleert.';
    });

    // --- PUSH NOTIFICATION HANDLERS ---
    let lastSavedTopic = '';
    let lastSavedServer = '';

    const updateNtfySetupGuide = (topic, server) => {
       if (!topic || topic === '-' || topic === 'Kein Topic konfiguriert') {
          ntfySetupGuideRead.innerHTML = 'Kein Push-Topic konfiguriert. Generiere eines, um Benachrichtigungen zu aktivieren.';
          return;
       }
       const base = server ? (server.endsWith('/') ? server.slice(0, -1) : server) : 'https://ntfy.sh';
       const url = `${base}/${topic}`;
       ntfySetupGuideRead.innerHTML = `Abonniere das Topic in der ntfy-App:<br><a href="${url}" target="_blank" style="color:var(--accent-primary); text-decoration:underline; font-family:var(--font-mono); word-break:break-all; font-size: 0.8rem; display: inline-block; margin-top: 0.25rem;">${topic}</a>`;
    };

    const loadNtfyTopic = async () => {
       try {
          const res = await fetch('/api/notifications/config');
          if (res.ok) {
             const data = await res.json();
             lastSavedServer = data.server || 'https://ntfy.sh';
             lastSavedTopic = data.topic || '';

             ntfyServerInput.value = lastSavedServer;
             ntfyServerDisplay.textContent = lastSavedServer;

             if (lastSavedTopic) {
                ntfyTopicInput.value = lastSavedTopic;
                ntfyTopicDisplay.textContent = lastSavedTopic;
                updateNtfySetupGuide(lastSavedTopic, lastSavedServer);
             } else {
                ntfyTopicInput.value = '';
                ntfyTopicDisplay.textContent = 'Kein Topic konfiguriert';
                updateNtfySetupGuide('', lastSavedServer);
             }
          }
       } catch (err) {
          console.error('Error fetching ntfy config:', err);
       }
    };

    if (btnSwitchToEdit) {
       btnSwitchToEdit.addEventListener('click', (e) => {
          e.preventDefault();
          ntfyReadView.style.display = 'none';
          ntfyEditView.style.display = 'flex';
       });
    }

    if (btnCancelEdit) {
       btnCancelEdit.addEventListener('click', (e) => {
          e.preventDefault();
          // Reset inputs to last saved values
          ntfyTopicInput.value = lastSavedTopic;
          ntfyServerInput.value = lastSavedServer;
          ntfyTopicInput.type = 'password';
          if (btnShowTopic) btnShowTopic.textContent = 'Anzeigen';

          ntfyEditView.style.display = 'none';
          ntfyReadView.style.display = 'flex';
       });
    }

    if (btnCopyTopic) {
       btnCopyTopic.addEventListener('click', (e) => {
          e.preventDefault();
          const topic = ntfyTopicDisplay.textContent;
          if (!topic || topic === 'Kein Topic konfiguriert' || topic === '-') {
             showToast('Kein Topic zum Kopieren vorhanden.', 'error');
             return;
          }
          navigator.clipboard.writeText(topic)
             .then(() => showToast('Topic in die Zwischenablage kopiert!', 'success'))
             .catch(() => showToast('Fehler beim Kopieren des Topics.', 'error'));
       });
    }

    if (btnCopyServer) {
       btnCopyServer.addEventListener('click', (e) => {
          e.preventDefault();
          const server = ntfyServerDisplay.textContent;
          navigator.clipboard.writeText(server)
             .then(() => showToast('Server-URL in die Zwischenablage kopiert!', 'success'))
             .catch(() => showToast('Fehler beim Kopieren der Server-URL.', 'error'));
       });
    }

    if (btnShowTopic) {
       btnShowTopic.addEventListener('click', (e) => {
          e.preventDefault();
          if (ntfyTopicInput.type === 'password') {
             ntfyTopicInput.type = 'text';
             btnShowTopic.textContent = 'Verbergen';
          } else {
             ntfyTopicInput.type = 'password';
             btnShowTopic.textContent = 'Anzeigen';
          }
       });
    }

    if (btnGenerateTopic) {
       btnGenerateTopic.addEventListener('click', (e) => {
          e.preventDefault();
          // Generate a cryptographically secure-looking random string
          const randomStr = Math.random().toString(36).substring(2, 7) + Math.random().toString(36).substring(2, 7);
          const secureTopic = `actual-fints-sync-bp-${randomStr}`;
          ntfyTopicInput.value = secureTopic;
          ntfyTopicInput.type = 'text';
          if (btnShowTopic) btnShowTopic.textContent = 'Verbergen';
          showToast('Zufälliges Topic generiert. Vergiss nicht zu speichern!', 'success');
       });
    }

    if (saveNtfyBtn) {
        saveNtfyBtn.addEventListener('click', async (e) => {
           e.preventDefault();
           const topic = ntfyTopicInput.value.trim();
           const server = ntfyServerInput.value.trim() || 'https://ntfy.sh';
           
           try {
              saveNtfyBtn.disabled = true;
              saveNtfyBtn.innerHTML = '<span class="material-icons btn-icon spinning-icon">sync</span> Speichern...';
              
              const res = await fetch('/api/notifications/config', {
                 method: 'POST',
                 headers: {
                    'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({ topic, server })
              });
              
              if (res.ok) {
                 showToast('Push-Konfiguration erfolgreich in DB gespeichert!', 'success');
                 lastSavedTopic = topic;
                 lastSavedServer = server;

                 ntfyTopicDisplay.textContent = topic || 'Kein Topic konfiguriert';
                 ntfyServerDisplay.textContent = server;
                 updateNtfySetupGuide(topic, server);

                 // Switch back to read-only view
                 ntfyEditView.style.display = 'none';
                 ntfyReadView.style.display = 'flex';
              } else {
                 const errData = await res.json();
                 showToast(errData.error || 'Fehler beim Speichern der Konfiguration.', 'error');
              }
           } catch (err) {
              console.error('Error saving ntfy config:', err);
              showToast('Serverfehler beim Speichern.', 'error');
           } finally {
              saveNtfyBtn.disabled = false;
              saveNtfyBtn.innerHTML = '<span class="material-icons btn-icon">save</span> Speichern';
           }
        });
     }

     if (btnTestPush) {
        btnTestPush.addEventListener('click', async (e) => {
           e.preventDefault();
           btnTestPush.disabled = true;
           const oldText = btnTestPush.innerHTML;
           btnTestPush.innerHTML = '<span class="material-icons btn-icon spinning-icon">sync</span> Teste...';
           try {
              const res = await fetch('/api/notifications/test', { method: 'POST' });
              const data = await res.json();
              if (res.ok && data.success) {
                 showToast('Test-Push erfolgreich gesendet!', 'success');
              } else {
                 showToast(data.error || 'Test-Push fehlgeschlagen.', 'error');
              }
           } catch (err) {
              console.error('Test push error:', err);
              showToast('Netzwerk- oder Serverfehler beim Test-Push.', 'error');
           } finally {
              btnTestPush.disabled = false;
              btnTestPush.innerHTML = oldText;
           }
        });
     }

     // --- PWA WEB-PUSH HANDLERS ---
     function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
           .replace(/\-/g, '+')
           .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
           outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
     }

     function detectPlatform() {
        const ua = navigator.userAgent.toLowerCase();
        if (/ipad|iphone|ipod/.test(ua) && !window.MSStream) return 'iOS';
        if (/android/.test(ua)) return 'Android';
        if (/macintosh|mac os x/.test(ua)) return 'macOS';
        if (/windows|win32/.test(ua)) return 'Windows';
        if (/linux/.test(ua)) return 'Linux';
        return 'Browser';
     }

     function checkPwaPushSupport() {
        const isPushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
        const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

        if (isIOS && !isStandalone) {
           if (pwaPushIosNote) pwaPushIosNote.style.display = 'block';
        } else {
           if (pwaPushIosNote) pwaPushIosNote.style.display = 'none';
        }

        return isPushSupported;
     }

     async function loadPushStatus() {
        if (!checkPwaPushSupport()) {
           if (settingsPushStatus) {
              settingsPushStatus.textContent = 'Nicht unterstützt';
              settingsPushStatus.style.color = 'var(--text-muted)';
              settingsPushStatus.style.background = 'rgba(255, 255, 255, 0.05)';
              settingsPushStatus.style.border = '1px solid rgba(255, 255, 255, 0.08)';
           }
           if (pwaPushUnregisteredActions) pwaPushUnregisteredActions.style.display = 'none';
           if (pwaPushRegisteredActions) pwaPushRegisteredActions.style.display = 'none';
           return;
        }

        try {
           const reg = await navigator.serviceWorker.ready;
           const sub = await reg.pushManager.getSubscription();
           
           if (sub) {
              if (settingsPushStatus) {
                 settingsPushStatus.textContent = 'Aktiviert';
                 settingsPushStatus.style.color = 'var(--success)';
                 settingsPushStatus.style.background = 'rgba(16, 185, 129, 0.1)';
                 settingsPushStatus.style.border = '1px solid rgba(16, 185, 129, 0.25)';
              }
              if (pwaPushUnregisteredActions) pwaPushUnregisteredActions.style.display = 'none';
              if (pwaPushRegisteredActions) pwaPushRegisteredActions.style.display = 'flex';
           } else {
              if (settingsPushStatus) {
                 settingsPushStatus.textContent = 'Deaktiviert';
                 settingsPushStatus.style.color = 'var(--text-muted)';
                 settingsPushStatus.style.background = 'rgba(255, 255, 255, 0.05)';
                 settingsPushStatus.style.border = '1px solid rgba(255, 255, 255, 0.08)';
              }
              if (pwaPushUnregisteredActions) pwaPushUnregisteredActions.style.display = 'flex';
              if (pwaPushRegisteredActions) pwaPushRegisteredActions.style.display = 'none';
           }
        } catch (err) {
           console.error('Error getting push subscription status:', err);
        }
     }

     async function loadPushSubscriptions() {
        if (!pwaPushDevicesContainer) return;
        try {
           const res = await fetch('/api/auth/push-subscriptions');
           if (!res.ok) return;
           const subscriptions = await res.json();
           
           if (subscriptions.length === 0) {
              pwaPushDevicesContainer.innerHTML = `
                 <div style="font-size:0.8rem; color:var(--text-muted); font-style:italic; text-align:center; padding: 0.5rem 0; border: 1px dashed var(--display-border); border-radius: 8px;">
                    Keine Geräte abonniert
                 </div>
              `;
              return;
           }
           
           pwaPushDevicesContainer.innerHTML = subscriptions.map(sub => {
              const dateStr = new Date(sub.createdAt).toLocaleDateString('de-DE', {
                 day: '2-digit',
                 month: '2-digit',
                 year: 'numeric',
                 hour: '2-digit',
                 minute: '2-digit'
              });
              
              let platformIcon = 'computer';
              const p = sub.platform ? sub.platform.toLowerCase() : '';
              if (p.includes('iphone') || p.includes('ios') || p.includes('ipod') || p.includes('ipad')) {
                 platformIcon = 'phone_iphone';
              } else if (p.includes('android')) {
                 platformIcon = 'phone_android';
              }
              
              return `
                 <div style="display:flex; justify-content:space-between; align-items:center; background:var(--display-bg); border:1px solid var(--display-border); padding:0.5rem 0.75rem; border-radius:8px; gap:0.5rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem; min-width:0; text-align:left;">
                       <span class="material-icons" style="font-size:1.2rem; color:var(--text-muted); flex-shrink:0;">${platformIcon}</span>
                       <div style="display:flex; flex-direction:column; gap:0.15rem; min-width:0;">
                          <span style="font-size:0.85rem; font-weight:500; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(sub.deviceName)}</span>
                          <span style="font-size:0.7rem; color:var(--text-muted);">${dateStr}</span>
                       </div>
                    </div>
                    <button class="btn secondary btn-delete-push" data-endpoint="${escapeHtml(sub.endpoint)}" style="padding:0; width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--danger); border-color:rgba(239, 68, 68, 0.2); background:transparent;" title="Abonnement löschen">
                       <span class="material-icons" style="font-size:1rem;">delete</span>
                    </button>
                 </div>
              `;
           }).join('');
           
           // Wire delete button listeners
           pwaPushDevicesContainer.querySelectorAll('.btn-delete-push').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                 e.preventDefault();
                 const endpoint = btn.getAttribute('data-endpoint');
                 if (confirm('Dieses Abonnement wirklich löschen?')) {
                    try {
                       btn.disabled = true;
                       const res = await fetch('/api/auth/push-unsubscribe', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ endpoint })
                       });
                       if (res.ok) {
                          showToast('Abonnement erfolgreich gelöscht.', 'success');
                          
                          // Check if we deleted our own local subscription
                          if ('serviceWorker' in navigator && 'PushManager' in window) {
                             const reg = await navigator.serviceWorker.ready;
                             const sub = await reg.pushManager.getSubscription();
                             if (sub && sub.endpoint === endpoint) {
                                await sub.unsubscribe();
                             }
                          }
                          
                          loadPushStatus();
                          loadPushSubscriptions();
                       } else {
                          const errData = await res.json();
                          showToast(errData.error || 'Fehler beim Löschen des Abonnements.', 'error');
                       }
                    } catch (err) {
                       console.error('Error unsubscribing device:', err);
                       showToast('Netzwerk- oder Serverfehler beim Löschen.', 'error');
                    } finally {
                       btn.disabled = false;
                    }
                 }
              });
           });
           
        } catch (err) {
           console.error('Error loading push subscriptions:', err);
        }
     }

     async function handlePushSubscribe() {
        if (!checkPwaPushSupport()) {
           showToast('Web-Push-Benachrichtigungen werden von diesem Browser/Gerät nicht unterstützt.', 'error');
           return;
        }

        const deviceName = settingsPushDeviceName ? settingsPushDeviceName.value.trim() : '';
        if (!deviceName) {
           showToast('Bitte gib einen Namen für dieses Gerät ein.', 'error');
           return;
        }

        try {
           btnPwaPushSubscribe.disabled = true;
           const oldText = btnPwaPushSubscribe.innerHTML;
           btnPwaPushSubscribe.innerHTML = '<span class="material-icons btn-icon spinning-icon">sync</span> Aktivieren...';

           // Request Notification permission first if not granted
           let permission = Notification.permission;
           if (permission === 'default') {
              permission = await Notification.requestPermission();
           }

           if (permission !== 'granted') {
              showToast('Mitteilungs-Berechtigung wurde verweigert.', 'error');
              btnPwaPushSubscribe.disabled = false;
              btnPwaPushSubscribe.innerHTML = oldText;
              return;
           }

           // Get VAPID public key
           const vapidRes = await fetch('/api/auth/push-vapid-public');
           if (!vapidRes.ok) {
              const errData = await vapidRes.json();
              throw new Error(errData.error || 'VAPID-Schlüssel konnte nicht abgerufen werden.');
           }
           const { publicKey } = await vapidRes.json();
           const applicationServerKey = urlBase64ToUint8Array(publicKey);

           // Register or get subscription
           const reg = await navigator.serviceWorker.ready;
           const subscription = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey
           });

           // Send subscription to backend
           const platform = detectPlatform();
           const subRes = await fetch('/api/auth/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                 subscription,
                 deviceName,
                 platform
              })
           });

           if (subRes.ok) {
              showToast('Web-Push erfolgreich für dieses Gerät aktiviert!', 'success');
              if (settingsPushDeviceName) settingsPushDeviceName.value = '';
              loadPushStatus();
              loadPushSubscriptions();
           } else {
              const errData = await subRes.json();
              // Clean up local subscription if backend registration failed
              await subscription.unsubscribe();
              throw new Error(errData.error || 'Registrierung auf dem Server fehlgeschlagen.');
           }

        } catch (err) {
           console.error('Error activating Web-Push:', err);
           showToast(err.message || 'Fehler beim Aktivieren von Web-Push.', 'error');
        } finally {
           btnPwaPushSubscribe.disabled = false;
           btnPwaPushSubscribe.innerHTML = `<span class="material-icons" style="font-size:1.1rem;">notifications_active</span> Aktivieren`;
        }
     }

     async function handlePushUnsubscribe() {
        if (!checkPwaPushSupport()) return;

        try {
           btnPwaPushUnsubscribe.disabled = true;
           const oldText = btnPwaPushUnsubscribe.innerHTML;
           btnPwaPushUnsubscribe.innerHTML = '<span class="material-icons btn-icon spinning-icon">sync</span> Deaktivieren...';

           const reg = await navigator.serviceWorker.ready;
           const subscription = await reg.pushManager.getSubscription();

           if (subscription) {
              // Call backend unsubscribe
              const res = await fetch('/api/auth/push-unsubscribe', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ endpoint: subscription.endpoint })
              });

              if (res.ok) {
                 // Unsubscribe locally
                 await subscription.unsubscribe();
                 showToast('Web-Push für dieses Gerät erfolgreich deaktiviert.', 'success');
              } else {
                 const errData = await res.json();
                 showToast(errData.error || 'Fehler beim Deaktivieren auf dem Server.', 'error');
              }
           } else {
              showToast('Kein aktives Abonnement auf diesem Gerät gefunden.', 'error');
           }

           loadPushStatus();
           loadPushSubscriptions();

        } catch (err) {
           console.error('Error deactivating Web-Push:', err);
           showToast('Fehler beim Deaktivieren von Web-Push.', 'error');
        } finally {
           btnPwaPushUnsubscribe.disabled = false;
           btnPwaPushUnsubscribe.innerHTML = `<span class="material-icons" style="font-size:1.1rem;">notifications_off</span> Deaktivieren`;
        }
     }

     async function handlePushTest() {
        try {
           btnPwaPushTest.disabled = true;
           const oldText = btnPwaPushTest.innerHTML;
           btnPwaPushTest.innerHTML = '<span class="material-icons btn-icon spinning-icon">sync</span> Testen...';

           const res = await fetch('/api/auth/push-test', { method: 'POST' });
           const data = await res.json();

           if (res.ok && data.success) {
              showToast('Test-Push-Mitteilung wurde an alle aktiven Abonnements gesendet!', 'success');
              loadPushSubscriptions();
           } else {
              showToast(data.error || 'Fehler beim Senden der Test-Push-Mitteilung.', 'error');
           }
        } catch (err) {
           console.error('Error sending test push:', err);
           showToast('Netzwerk- oder Serverfehler beim Test-Push.', 'error');
        } finally {
           btnPwaPushTest.disabled = false;
           btnPwaPushTest.innerHTML = `<span class="material-icons" style="font-size:1.1rem;">send</span> Testen`;
        }
     }

   // --- ACTUAL BUDGET CONNECTION HANDLERS ---
   let lastSavedAbUrl = '';
   let lastSavedAbSync = '';
   let lastSavedAbHasPassword = false;

   const loadAbConfig = async () => {
      try {
         const res = await fetch('/api/budget/config');
         if (res.ok) {
            const data = await res.json();
            lastSavedAbUrl = data.url || '';
            lastSavedAbSync = data.syncDb || '';
            lastSavedAbHasPassword = data.hasPassword;

            const abUrlDisplay = document.getElementById('ab-url-display');
            const abSyncDisplay = document.getElementById('ab-sync-display');
            const abPassStatus = document.getElementById('ab-pass-status');
            const abUrlInput = document.getElementById('ab-url-input');
            const abSyncInput = document.getElementById('ab-sync-input');
            const abPassInput = document.getElementById('ab-pass-input');

            if (abUrlDisplay) abUrlDisplay.textContent = lastSavedAbUrl || 'Nicht konfiguriert';
            if (abSyncDisplay) abSyncDisplay.textContent = lastSavedAbSync || 'Nicht konfiguriert';
            if (abPassStatus) abPassStatus.textContent = lastSavedAbHasPassword ? '●●●●●●●● (Konfiguriert)' : 'Nicht konfiguriert';

            if (abUrlInput) abUrlInput.value = lastSavedAbUrl;
            if (abSyncInput) abSyncInput.value = lastSavedAbSync;
            if (abPassInput) abPassInput.value = lastSavedAbHasPassword ? '●●●●●●●●' : '';
         }
      } catch (err) {
         console.error('Error fetching ab config:', err);
      }
   };

   const btnAbSwitchToEdit = document.getElementById('btn-ab-switch-to-edit');
   const btnAbCancelEdit = document.getElementById('btn-ab-cancel-edit');
   const abReadView = document.getElementById('ab-read-view');
   const abEditView = document.getElementById('ab-edit-view');
   const btnAbShowPass = document.getElementById('btn-ab-show-pass');
   const saveAbBtn = document.getElementById('save-ab-btn');
   const abPassInput = document.getElementById('ab-pass-input');

   if (btnAbSwitchToEdit && abReadView && abEditView) {
      btnAbSwitchToEdit.addEventListener('click', (e) => {
         e.preventDefault();
         abReadView.style.display = 'none';
         abEditView.style.display = 'flex';
      });
   }

   if (btnAbCancelEdit && abReadView && abEditView) {
      btnAbCancelEdit.addEventListener('click', (e) => {
         e.preventDefault();
         const abUrlInput = document.getElementById('ab-url-input');
         const abSyncInput = document.getElementById('ab-sync-input');
         const abPassInput = document.getElementById('ab-pass-input');

         if (abUrlInput) abUrlInput.value = lastSavedAbUrl;
         if (abSyncInput) abSyncInput.value = lastSavedAbSync;
         if (abPassInput) abPassInput.value = lastSavedAbHasPassword ? '●●●●●●●●' : '';
         
         if (abPassInput) abPassInput.type = 'password';
         if (btnAbShowPass) btnAbShowPass.textContent = 'Anzeigen';

         abEditView.style.display = 'none';
         abReadView.style.display = 'flex';
      });
   }

   if (btnAbShowPass && abPassInput) {
      btnAbShowPass.addEventListener('click', (e) => {
         e.preventDefault();
         if (abPassInput.type === 'password') {
            abPassInput.type = 'text';
            btnAbShowPass.textContent = 'Verbergen';
         } else {
            abPassInput.type = 'password';
            btnAbShowPass.textContent = 'Anzeigen';
         }
      });
   }

   if (saveAbBtn) {
      saveAbBtn.addEventListener('click', async (e) => {
         e.preventDefault();
         const abUrlInput = document.getElementById('ab-url-input');
         const abSyncInput = document.getElementById('ab-sync-input');
         const abPassInput = document.getElementById('ab-pass-input');

         const url = abUrlInput ? abUrlInput.value.trim() : '';
         const syncDb = abSyncInput ? abSyncInput.value.trim() : '';
         const password = abPassInput ? abPassInput.value.trim() : '';

         if (!url || !syncDb) {
            showToast('Server-URL und Budget Sync ID sind erforderlich.', 'error');
            return;
         }

         try {
            saveAbBtn.disabled = true;
            saveAbBtn.innerHTML = '<span class="material-icons btn-icon spinning-icon">sync</span> Speichern...';

            const res = await fetch('/api/budget/config', {
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json'
               },
               body: JSON.stringify({ url, syncDb, password })
            });

            if (res.ok) {
               showToast('Actual Budget Verbindung erfolgreich gespeichert!', 'success');
               lastSavedAbUrl = url;
               lastSavedAbSync = syncDb;
               if (password && password !== '●●●●●●●●') {
                  lastSavedAbHasPassword = true;
               }

               const abUrlDisplay = document.getElementById('ab-url-display');
               const abSyncDisplay = document.getElementById('ab-sync-display');
               const abPassStatus = document.getElementById('ab-pass-status');

               if (abUrlDisplay) abUrlDisplay.textContent = url;
               if (abSyncDisplay) abSyncDisplay.textContent = syncDb;
               if (abPassStatus) abPassStatus.textContent = (password || lastSavedAbHasPassword) ? '●●●●●●●● (Konfiguriert)' : 'Nicht konfiguriert';

               if (abPassInput) abPassInput.type = 'password';
               if (btnAbShowPass) btnAbShowPass.textContent = 'Anzeigen';

               // Trigger status load to verify Actual badge
               loadStatus();

               if (abEditView && abReadView) {
                  abEditView.style.display = 'none';
                  abReadView.style.display = 'flex';
               }
            } else {
               const errData = await res.json();
               showToast(errData.error || 'Fehler beim Speichern der Verbindung.', 'error');
            }
         } catch (err) {
            console.error('Error saving ab config:', err);
            showToast('Serverfehler beim Speichern.', 'error');
         } finally {
            saveAbBtn.disabled = false;
            saveAbBtn.innerHTML = '<span class="material-icons btn-icon">save</span> Speichern';
         }
      });
    }

    const testAbBtn = document.getElementById('test-ab-btn');
    if (testAbBtn) {
       testAbBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          const abUrlInput = document.getElementById('ab-url-input');
          const abSyncInput = document.getElementById('ab-sync-input');
          const abPassInput = document.getElementById('ab-pass-input');

          const url = abUrlInput ? abUrlInput.value.trim() : '';
          const syncDb = abSyncInput ? abSyncInput.value.trim() : '';
          const password = abPassInput ? abPassInput.value.trim() : '';

          if (!url || !syncDb) {
             showToast('Server-URL und Budget Sync ID sind erforderlich zum Testen.', 'error');
             return;
          }

          try {
             testAbBtn.disabled = true;
             testAbBtn.innerHTML = '<span class="material-icons btn-icon spinning-icon" id="test-ab-icon">sync</span> Verbinde...';

             const res = await fetch('/api/budget/test', {
                method: 'POST',
                headers: {
                   'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url, syncDb, password })
             });

             const data = await res.json();

             if (res.ok && data.success) {
                showToast('Verbindung zu Actual Budget erfolgreich hergestellt! 🎉', 'success');
             } else {
                showToast(data.error || 'Verbindung zu Actual Budget fehlgeschlagen.', 'error');
             }
          } catch (err) {
             console.error('Error testing ab connection:', err);
             showToast('Netzwerk- oder Serverfehler beim Verbindungstest.', 'error');
          } finally {
             testAbBtn.disabled = false;
             testAbBtn.innerHTML = '<span class="material-icons" style="font-size:1.15rem;" id="test-ab-icon">sync_alt</span> Verbindung testen';
          }
       });
    }

     // --- THEME MANAGEMENT ---
     const applyTheme = () => {
        const themeAuto = localStorage.getItem('theme_auto') !== 'false';
        const savedTheme = localStorage.getItem('theme') || 'dark';

        if (settingsSystemTheme) {
           settingsSystemTheme.checked = themeAuto;
        }

        if (themeAuto) {
           if (manualThemeGroup) manualThemeGroup.classList.add('disabled');
           if (themeBtnDark) themeBtnDark.classList.remove('active');
           if (themeBtnLight) themeBtnLight.classList.remove('active');

           const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
           if (systemPrefersLight) {
              document.body.classList.add('light-theme');
           } else {
              document.body.classList.remove('light-theme');
           }
        } else {
           if (manualThemeGroup) manualThemeGroup.classList.remove('disabled');
           
           if (savedTheme === 'light') {
              document.body.classList.add('light-theme');
              if (themeBtnLight) themeBtnLight.classList.add('active');
              if (themeBtnDark) themeBtnDark.classList.remove('active');
           } else {
              document.body.classList.remove('light-theme');
              if (themeBtnDark) themeBtnDark.classList.add('active');
              if (themeBtnLight) themeBtnLight.classList.remove('active');
           }
        }
     };

     if (settingsSystemTheme) {
        settingsSystemTheme.addEventListener('change', () => {
           localStorage.setItem('theme_auto', settingsSystemTheme.checked ? 'true' : 'false');
           applyTheme();
           showToast(settingsSystemTheme.checked ? 'Systemeinstellung für Design aktiviert' : 'Manuelle Design-Auswahl aktiviert', 'info');
        });
     }

     if (themeBtnDark) {
        themeBtnDark.addEventListener('click', (e) => {
           e.preventDefault();
           localStorage.setItem('theme_auto', 'false');
           localStorage.setItem('theme', 'dark');
           applyTheme();
           showToast('Dunkles Design aktiviert', 'info');
        });
     }

     if (themeBtnLight) {
        themeBtnLight.addEventListener('click', (e) => {
           e.preventDefault();
           localStorage.setItem('theme_auto', 'false');
           localStorage.setItem('theme', 'light');
           applyTheme();
           showToast('Helles Design aktiviert', 'info');
        });
     }

     const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
     if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', () => {
           const themeAuto = localStorage.getItem('theme_auto') !== 'false';
           if (themeAuto) applyTheme();
        });
     }

      // --- CRON LOG MODAL HANDLERS ---
      const openCronLogModal = () => {
         if (cronLogContent) {
            cronLogContent.textContent = lastCronSyncLog || 'Keine Logs vorhanden.';
         }
         if (cronLogModal) {
            cronLogModal.classList.add('show');
         }
      };

      const closeCronLogModal = () => {
         if (cronLogModal) {
            cronLogModal.classList.remove('show');
         }
      };

      const btnViewCronLog = document.getElementById('btn-view-cron-log');
      if (btnViewCronLog) {
         btnViewCronLog.addEventListener('click', (e) => {
            e.preventDefault();
            openCronLogModal();
         });
      }

      if (cronLogCloseBtn) {
         cronLogCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeCronLogModal();
         });
      }

      if (cronLogOkBtn) {
         cronLogOkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            closeCronLogModal();
         });
      }

      // Close modal on outside click
      if (cronLogModal) {
         cronLogModal.addEventListener('click', (e) => {
            if (e.target === cronLogModal) {
               closeCronLogModal();
            }
         });
      }

      // --- SERVICE WORKER REGISTRATION ---
      if ('serviceWorker' in navigator) {
         window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
               .then(reg => console.log('Service Worker registered successfully:', reg.scope))
               .catch(err => console.error('Service Worker registration failed:', err));
         });
      }

      // --- SECURITY & LOCK SCREEN SELECTORS ---
      const lockScreen = document.getElementById('lock-screen');
      const lockTitle = document.getElementById('lock-title');
      const lockDesc = document.getElementById('lock-desc');
      const lockSetupContainer = document.getElementById('lock-setup-container');
      const lockDeviceName = document.getElementById('lock-device-name');
      const lockRegisterBtn = document.getElementById('lock-register-btn');
      const lockLoginBtn = document.getElementById('lock-login-btn');

      const settingsDeviceName = document.getElementById('settings-device-name');
      const btnAddPasskey = document.getElementById('btn-add-passkey');
      const btnAuthLogout = document.getElementById('btn-auth-logout');

      // --- SECURITY HELPERS ---
      function base64urlToArrayBuffer(base64url) {
         let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
         while (base64.length % 4) {
            base64 += '=';
         }
         const raw = window.atob(base64);
         const buffer = new ArrayBuffer(raw.length);
         const view = new Uint8Array(buffer);
         for (let i = 0; i < raw.length; i++) {
            view[i] = raw.charCodeAt(i);
         }
         return buffer;
      }

      function arrayBufferToBase64url(buffer) {
         const view = new Uint8Array(buffer);
         let binary = '';
         for (let i = 0; i < view.byteLength; i++) {
            binary += String.fromCharCode(view[i]);
         }
         const base64 = window.btoa(binary);
         return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      }

      // --- AUTHENTICATION FLOWS ---
      async function checkAuthStatus() {
         try {
            const res = await fetch('/api/auth/status');
            const data = await res.json();
            
            if (!data.configured) {
               // Setup Mode (First time)
               if (lockScreen) {
                  lockScreen.style.display = 'flex';
                  lockScreen.style.opacity = '1';
               }
               if (lockTitle) lockTitle.textContent = 'Passkey-Schutz einrichten';
               if (lockDesc) lockDesc.textContent = 'Erstelle deinen ersten Passkey, um den Actual-FinTS Connector abzusichern.';
               if (lockSetupContainer) lockSetupContainer.style.display = 'flex';
               if (lockLoginBtn) lockLoginBtn.style.display = 'none';
            } else if (!data.authenticated) {
               // Locked Mode
               if (lockScreen) {
                  lockScreen.style.display = 'flex';
                  lockScreen.style.opacity = '1';
               }
               if (lockTitle) lockTitle.textContent = 'Bereich gesperrt';
               if (lockDesc) lockDesc.textContent = 'Bitte authentifiziere dich per Passkey, um auf den FinTS Connector zuzugreifen.';
               if (lockSetupContainer) lockSetupContainer.style.display = 'none';
               if (lockLoginBtn) lockLoginBtn.style.display = 'flex';
               
               // Automatically trigger TouchID/FaceID scanner on lockscreen display
               handlePasskeyLogin();
            } else {
               // Unlocked Mode
               if (lockScreen) {
                  lockScreen.style.opacity = '0';
                  setTimeout(() => {
                     lockScreen.style.display = 'none';
                  }, 400);
               }
               
               // Run all normal app loaders
               initAppData();
            }
         } catch (err) {
            console.error('Auth status check failed:', err);
            showToast('Authentifizierungs-Status konnte nicht geladen werden.', 'error');
         }
      }

      async function handlePasskeyLogin() {
         try {
            const resOptions = await fetch('/api/auth/login-challenge', { method: 'POST' });
            if (!resOptions.ok) {
               const errData = await resOptions.json();
               throw new Error(errData.error || 'Challenge-Abruf fehlgeschlagen');
            }
            
            const { options, challengeId } = await resOptions.json();
            
            options.challenge = base64urlToArrayBuffer(options.challenge);
            if (options.allowCredentials) {
               for (const cred of options.allowCredentials) {
                  cred.id = base64urlToArrayBuffer(cred.id);
               }
            }
            
            const credential = await navigator.credentials.get({
               publicKey: options
            });
            
            if (!credential) {
               throw new Error('Authentifizierung abgebrochen.');
            }
            
            const body = {
               id: credential.id,
               rawId: arrayBufferToBase64url(credential.rawId),
               type: credential.type,
               response: {
                  authenticatorData: arrayBufferToBase64url(credential.response.authenticatorData),
                  clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
                  signature: arrayBufferToBase64url(credential.response.signature),
                  userHandle: credential.response.userHandle ? arrayBufferToBase64url(credential.response.userHandle) : null,
               }
            };
            
            const resVerify = await fetch('/api/auth/login-verify', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ body, challengeId })
            });
            
            if (!resVerify.ok) {
               const errData = await resVerify.json();
               throw new Error(errData.error || 'Verifizierung fehlgeschlagen');
            }
            
            const verifyResult = await resVerify.json();
            if (verifyResult.verified) {
               showToast('Erfolgreich entsperrt!', 'success');
               if (lockScreen) {
                  lockScreen.style.opacity = '0';
                  setTimeout(() => {
                     lockScreen.style.display = 'none';
                  }, 400);
               }
               
               initAppData();
            } else {
               throw new Error('Verifizierung fehlgeschlagen.');
            }
         } catch (err) {
            console.error('Passkey login error:', err);
            showToast(err.message, 'error');
         }
      }

      async function handlePasskeyRegistration(deviceNameVal, isFromSettings = false) {
         try {
            const deviceName = deviceNameVal.trim() || (isFromSettings ? 'Neues Gerät' : 'Hauptgerät');
            
            const resOptions = await fetch('/api/auth/register-challenge', { method: 'POST' });
            if (!resOptions.ok) {
               const errData = await resOptions.json();
               throw new Error(errData.error || 'Challenge-Abruf fehlgeschlagen');
            }
            
            const { options, challengeId } = await resOptions.json();
            
            options.challenge = base64urlToArrayBuffer(options.challenge);
            options.user.id = base64urlToArrayBuffer(options.user.id);
            if (options.excludeCredentials) {
               for (const cred of options.excludeCredentials) {
                  cred.id = base64urlToArrayBuffer(cred.id);
               }
            }
            
            const credential = await navigator.credentials.create({
               publicKey: options
            });
            
            if (!credential) {
               throw new Error('Registrierung abgebrochen.');
            }
            
            const body = {
               id: credential.id,
               rawId: arrayBufferToBase64url(credential.rawId),
               type: credential.type,
               response: {
                  clientDataJSON: arrayBufferToBase64url(credential.response.clientDataJSON),
                  attestationObject: arrayBufferToBase64url(credential.response.attestationObject),
                  transports: credential.getResponse ? credential.getResponse().transports : []
               }
            };
            
            const resVerify = await fetch('/api/auth/register-verify', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ body, challengeId, deviceName })
            });
            
            if (!resVerify.ok) {
               const errData = await resVerify.json();
               throw new Error(errData.error || 'Verifizierung fehlgeschlagen');
            }
            
            const verifyResult = await resVerify.json();
            if (verifyResult.verified) {
               showToast('Passkey erfolgreich eingerichtet!', 'success');
               if (!isFromSettings) {
                  if (lockScreen) {
                     lockScreen.style.opacity = '0';
                     setTimeout(() => {
                        lockScreen.style.display = 'none';
                     }, 400);
                  }
                  initAppData();
               } else {
                  if (settingsDeviceName) settingsDeviceName.value = '';
                  loadDevices();
               }
            } else {
               throw new Error('Registrierungs-Verifizierung fehlgeschlagen.');
            }
         } catch (err) {
            console.error('Passkey registration error:', err);
            showToast(err.message, 'error');
         }
      }

      async function loadDevices() {
         try {
            const settingsAuthStatus = document.getElementById('settings-auth-status');
            const resStatus = await fetch('/api/auth/status');
            const statusData = await resStatus.json();
            
            if (settingsAuthStatus) {
               if (statusData.configured) {
                  settingsAuthStatus.textContent = 'Aktiviert';
                  settingsAuthStatus.style.color = 'var(--success)';
                  settingsAuthStatus.style.background = 'rgba(16, 185, 129, 0.1)';
                  settingsAuthStatus.style.border = '1px solid rgba(16, 185, 129, 0.25)';
               } else {
                  settingsAuthStatus.textContent = 'Deaktiviert';
                  settingsAuthStatus.style.color = 'var(--text-muted)';
                  settingsAuthStatus.style.background = 'rgba(255, 255, 255, 0.05)';
                  settingsAuthStatus.style.border = '1px solid rgba(255, 255, 255, 0.08)';
               }
            }
            
            const res = await fetch('/api/auth/devices');
            if (!res.ok) return;
            
            const devices = await res.json();
            const container = document.getElementById('passkey-devices-container');
            if (!container) return;
            
            if (devices.length === 0) {
               container.innerHTML = `
                  <div style="font-size:0.8rem; color:var(--text-muted); font-style:italic; text-align:center; padding: 0.5rem 0; border: 1px dashed var(--display-border); border-radius: 8px;">
                     Keine Geräte registriert
                  </div>
               `;
               return;
            }
            
            container.innerHTML = devices.map(dev => {
               const dateStr = new Date(dev.createdAt).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
               });
               
               return `
                  <div style="display:flex; justify-content:space-between; align-items:center; background:var(--display-bg); border:1px solid var(--display-border); padding:0.5rem 0.75rem; border-radius:8px; gap:0.5rem;">
                     <div style="display:flex; flex-direction:column; gap:0.15rem; min-width:0; text-align:left;">
                        <span style="font-size:0.85rem; font-weight:500; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(dev.deviceName)}</span>
                        <span style="font-size:0.7rem; color:var(--text-muted);">${dateStr}</span>
                     </div>
                     <button class="btn secondary btn-delete-device" data-id="${dev.credentialID}" style="padding:0; width:28px; height:28px; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--danger); border-color:rgba(239, 68, 68, 0.2); background:transparent;" title="Gerät löschen">
                        <span class="material-icons" style="font-size:1rem;">delete</span>
                     </button>
                  </div>
               `;
            }).join('');
            
            container.querySelectorAll('.btn-delete-device').forEach(btn => {
               btn.addEventListener('click', async () => {
                  const id = btn.getAttribute('data-id');
                  if (confirm('Möchtest du dieses Gerät wirklich entfernen? Wenn dies dein letztes Gerät ist, wird der Passkey-Schutz deaktiviert.')) {
                     try {
                        const delRes = await fetch(`/api/auth/devices/${id}`, { method: 'DELETE' });
                        if (delRes.ok) {
                           showToast('Gerät erfolgreich entfernt.', 'success');
                           loadDevices();
                        } else {
                           const errData = await delRes.json();
                           showToast(errData.error || 'Fehler beim Löschen.', 'error');
                        }
                     } catch (e) {
                        showToast('Netzwerkfehler beim Löschen.', 'error');
                     }
                  }
               });
            });
         } catch (err) {
            console.error('Failed to load passkey devices:', err);
         }
      }

      async function handleLogout() {
         try {
            const res = await fetch('/api/auth/logout', { method: 'POST' });
            if (res.ok) {
               showToast('Erfolgreich abgemeldet.', 'success');
               checkAuthStatus();
            }
         } catch (err) {
            showToast('Abmeldung fehlgeschlagen.', 'error');
         }
      }

      function initAppData() {
         loadStatus();
         loadBanks();
         loadNtfyTopic();
         loadAbConfig();
         loadActualAccounts();
         loadDevices();
         loadPushStatus();
         loadPushSubscriptions();
      }

      // --- WIRE EVENT LISTENERS ---
      if (lockRegisterBtn) {
         lockRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const devName = lockDeviceName ? lockDeviceName.value : '';
            handlePasskeyRegistration(devName, false);
         });
      }

      if (lockLoginBtn) {
         lockLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            handlePasskeyLogin();
         });
      }

      if (btnAddPasskey) {
         btnAddPasskey.addEventListener('click', (e) => {
            e.preventDefault();
            const devName = settingsDeviceName ? settingsDeviceName.value : '';
            if (!devName.trim()) {
               showToast('Bitte einen Gerätenamen eingeben.', 'error');
               return;
            }
            handlePasskeyRegistration(devName, true);
         });
      }

      if (btnAuthLogout) {
         btnAuthLogout.addEventListener('click', (e) => {
            e.preventDefault();
            handleLogout();
         });
      }

      if (btnPwaPushSubscribe) {
         btnPwaPushSubscribe.addEventListener('click', (e) => {
            e.preventDefault();
            handlePushSubscribe();
          });
      }

      if (btnPwaPushUnsubscribe) {
         btnPwaPushUnsubscribe.addEventListener('click', (e) => {
            e.preventDefault();
            handlePushUnsubscribe();
         });
      }

      if (btnPwaPushTest) {
         btnPwaPushTest.addEventListener('click', (e) => {
            e.preventDefault();
            handlePushTest();
         });
      }

      // --- INITIALIZATION ---
      applyTheme();
      checkAuthStatus();

   // --- HELPERS ---
   function maskIban(iban) {
      if (!iban) return '';
      return iban.slice(0, 4) + '···' + iban.slice(-4);
   }

   function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
   }

   function formatAmount(cents) {
      const euros = cents / 100;
      const formatted = new Intl.NumberFormat('de-DE', {
         style: 'currency',
         currency: 'EUR'
      }).format(euros);
      return euros > 0 ? '+' + formatted : formatted;
   }

   function formatDate(dateStr) {
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      const [year, month, day] = dateStr.split('-');
      return `${day}.${month}.${year}`;
   }

});
