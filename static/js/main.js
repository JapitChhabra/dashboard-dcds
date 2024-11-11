document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Content Loaded");
    fetchTables().catch(error => {
        console.error('Error fetching tables:', error);
        document.getElementById('table-list').innerHTML = `
            <div class="error-message">
                Error loading tables: ${error.message}
            </div>
        `;
    });

    document.getElementById('add-item-btn').addEventListener('click', () => {
        const selectedTable = document.getElementById('selected-table').textContent;
        if (selectedTable && selectedTable !== 'Select a table') {
            showAddForm(selectedTable);
        } else {
            alert('Please select a table first');
        }
    });
});

async function fetchTables() {
    try {
        console.log("Fetching tables...");
        const response = await fetch('/api/tables');
        console.log("Response status:", response.status);
        
        const data = await response.json();
        console.log("Received data:", data);
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch tables');
        }
        
        const tableList = document.getElementById('table-list');
        
        if (!data || data.length === 0) {
            tableList.innerHTML = '<p>No tables found in the database.</p>';
            return;
        }
        
        tableList.innerHTML = ''; // Clear existing content
        
        data.forEach(table => {
            const tableItem = document.createElement('div');
            tableItem.className = 'tree-item';
            
            const tableContent = `
                <div class="tree-content">
                    <i data-lucide="chevron-right" class="tree-arrow"></i>
                    <i data-lucide="table-2" class="icon-table"></i>
                    <span>${table.name}</span>
                </div>
                <div class="column-list">
                    ${table.columns.map(col => `
                        <div class="column-item">
                            <i data-lucide="database" class="icon-column"></i>
                            <span>${col.name}</span>
                        </div>
                    `).join('')}
                </div>
            `;
            
            tableItem.innerHTML = tableContent;
            
            // Add click handler for the tree content
            const treeContent = tableItem.querySelector('.tree-content');
            treeContent.addEventListener('click', (e) => {
                // Toggle expansion
                tableItem.classList.toggle('expanded');
                // Load table data
                loadTableData(table.name);
            });
            
            tableList.appendChild(tableItem);
        });
        
        // Initialize Lucide icons for the new elements
        lucide.createIcons();
        
    } catch (error) {
        console.error('Error in fetchTables:', error);
        throw error;
    }
}

async function loadTableData(tableName) {
    try {
        const response = await fetch(`/api/table/${tableName}`);
        const data = await response.json();
        
        document.getElementById('selected-table').textContent = tableName;
        document.getElementById('total-rows').textContent = data.length;
        
        // Get primary key name based on table
        const primaryKey = getPrimaryKeyForTable(tableName);
        document.getElementById('primary-key').textContent = primaryKey;
        
        if (data.length > 0) {
            document.getElementById('total-columns').textContent = Object.keys(data[0]).length;
        }
        
        const tableContent = document.getElementById('table-content');
        
        if (data.length === 0) {
            tableContent.innerHTML = `
                <div class="empty-state">
                    <p>No data available</p>
                </div>
            `;
            return;
        }
        
        const columns = Object.keys(data[0]);
        tableContent.innerHTML = `
            <table>
                <thead>
                    <tr>
                        ${columns.map(col => `<th>${col}</th>`).join('')}
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(row => `
                        <tr>
                            ${columns.map(col => `<td>${row[col]}</td>`).join('')}
                            <td class="action-buttons">
                                <button onclick='showEditForm("${tableName}", ${JSON.stringify(row).replace(/'/g, "&#39;")})'>
                                    <i data-lucide="edit-2"></i>
                                </button>
                                <button onclick='deleteRecord("${tableName}", ${row[primaryKey]})'>
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        lucide.createIcons();
    } catch (error) {
        console.error('Error:', error);
        tableContent.innerHTML = `<div class="error-message">Error loading data: ${error.message}</div>`;
    }
}

async function showAddForm(tableName) {
    try {
        const response = await fetch('/api/tables');
        const tables = await response.json();
        
        const tableSchema = tables.find(t => t.name === tableName);
        if (!tableSchema) {
            console.error("Table schema not found for:", tableName);
            return;
        }

        // Get primary key for the table
        const primaryKey = getPrimaryKeyForTable(tableName);
        
        const form = `
            <div class="modal">
                <div class="modal-content">
                    <h3>Add New Record</h3>
                    <form onsubmit="addRecord('${tableName}', event)">
                        ${tableSchema.columns
                            .filter(col => {
                                // Only exclude created_at, include primary key for products table
                                return !col.name.includes('created_at');
                            })
                            .map(col => `
                                <div class="form-group">
                                    <label class="${col.nullable ? '' : 'required'}">${formatLabel(col.name)}</label>
                                    <input name="${col.name}" 
                                           type="${getInputType(col.type)}" 
                                           ${col.nullable ? '' : 'required'}
                                           class="form-input"
                                           placeholder="Enter ${formatLabel(col.name).toLowerCase()}"
                                           ${col.name === primaryKey ? '' : ''}>
                                </div>
                            `).join('')}
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" onclick="closeModal()">
                                Cancel
                            </button>
                            <button type="submit" class="btn-primary">
                                <i data-lucide="save"></i>
                                Save Record
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', form);
        lucide.createIcons();
    } catch (error) {
        console.error("Error showing add form:", error);
        alert('Error creating form');
    }
}

function showEditForm(tableName, rowData) {
    const primaryKey = getPrimaryKeyForTable(tableName);
    const form = `
        <div class="modal">
            <div class="modal-content">
                <h3>Edit Record</h3>
                <form onsubmit="updateRecord('${tableName}', ${rowData[primaryKey]}, event)">
                    ${Object.entries(rowData)
                        .filter(([key]) => key !== primaryKey && key !== 'created_at')
                        .map(([key, value]) => `
                            <div class="form-group">
                                <label>${formatLabel(key)}</label>
                                <input name="${key}" 
                                       value="${value || ''}" 
                                       type="${getInputType(typeof value)}"
                                       class="form-input">
                            </div>
                        `).join('')}
                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn-primary">
                            <i data-lucide="save"></i>
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', form);
    lucide.createIcons();
}

function closeModal() {
    document.querySelector('.modal').remove();
}

async function addRecord(tableName, event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    
    // Add current timestamp for created_at
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    data.created_at = now;
    
    // Convert product_id to number if it exists
    if (data.product_id) {
        data.product_id = parseInt(data.product_id);
    }
    
    try {
        const response = await fetch(`/api/table/${tableName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            closeModal();
            loadTableData(tableName);
        } else {
            console.error('Error response:', responseData);
            alert(`Error adding record: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error adding record: ' + error.message);
    }
}

async function updateRecord(tableName, id, event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    const primaryKey = getPrimaryKeyForTable(tableName);
    data[primaryKey] = id;
    
    try {
        const response = await fetch(`/api/table/${tableName}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            closeModal();
            loadTableData(tableName);
        } else {
            console.error('Error response:', responseData);
            alert(`Error updating record: ${responseData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error updating record: ' + error.message);
    }
}

async function deleteRecord(tableName, id) {
    if (!id) {
        console.error('No ID provided for deletion');
        alert('Error: No ID provided for deletion');
        return;
    }

    if (!confirm('Are you sure you want to delete this record?')) {
        return;
    }
    
    try {
        const primaryKey = getPrimaryKeyForTable(tableName);
        const response = await fetch(`/api/table/${tableName}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                primaryKey: primaryKey,
                id: id 
            }),
        });
        
        const data = await response.json();
        
        if (response.ok) {
            loadTableData(tableName);
        } else {
            console.error('Error response:', data);
            alert(`Error deleting record: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error deleting record: ' + error.message);
    }
}

function getInputType(sqlType) {
    if (sqlType.includes('INT')) return 'number';
    if (sqlType.includes('DECIMAL') || sqlType.includes('FLOAT')) return 'number';
    if (sqlType.includes('DATE')) return 'date';
    if (sqlType.includes('TIME')) return 'time';
    return 'text';
}

// Add this at the end of the file to check if the script is loading
console.log("Main.js loaded and running");

// Add some CSS styles for the form buttons
const styles = `
.btn-primary {
    background-color: #000;
    color: white;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.btn-secondary {
    background-color: #e5e7eb;
    color: #374151;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.form-input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    margin-top: 0.25rem;
}

.form-group {
    margin-bottom: 1rem;
}

.form-group label {
    display: block;
    font-weight: 500;
    color: #374151;
}
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

// Add helper function to format labels
function formatLabel(str) {
    return str
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Add function to get primary key name for each table
function getPrimaryKeyForTable(tableName) {
    const primaryKeys = {
        'products': 'product_id',
        'orders': 'order_id',
        'order_items': 'order_item_id',
        'order_item_refunds': 'order_item_refund_id',
        'website_pageviews': 'website_pageview_id',
        'website_session': 'website_session_id'
    };
    return primaryKeys[tableName] || 'id';
}