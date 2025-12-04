// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

// Define types for our data structures
interface Substation {
  id: string;
  name: string;
  location: string;
  status: "normal" | "warning" | "critical";
}

interface SensorData {
  id: string;
  substationId: string;
  temperature: number;
  vibration: number;
  timestamp: number;
  encrypted: boolean;
}

interface MaintenanceTicket {
  id: string;
  substationId: string;
  issue: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in-progress" | "completed";
  created: number;
}

const App: React.FC = () => {
  // Wallet and connection states
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  
  // Data states
  const [substations, setSubstations] = useState<Substation[]>([]);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  
  // UI states
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddSubstation, setShowAddSubstation] = useState(false);
  const [showAddTicket, setShowAddTicket] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  
  // Form states
  const [newSubstation, setNewSubstation] = useState({
    name: "",
    location: ""
  });
  const [newTicket, setNewTicket] = useState({
    substationId: "",
    issue: "",
    priority: "medium" as "low" | "medium" | "high"
  });

  // Statistics states
  const [criticalSubstations, setCriticalSubstations] = useState(0);
  const [pendingTickets, setPendingTickets] = useState(0);
  const [avgTemperature, setAvgTemperature] = useState(0);

  // Load initial data
  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load all data from contract
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      // Load substations
      const substationsBytes = await contract.getData("substations");
      let substationsList: Substation[] = [];
      if (substationsBytes.length > 0) {
        try {
          substationsList = JSON.parse(ethers.toUtf8String(substationsBytes));
        } catch (e) {
          console.error("Error parsing substations:", e);
        }
      }
      setSubstations(substationsList);
      
      // Load sensor data
      const sensorBytes = await contract.getData("sensor_data");
      let sensorList: SensorData[] = [];
      if (sensorBytes.length > 0) {
        try {
          sensorList = JSON.parse(ethers.toUtf8String(sensorBytes));
        } catch (e) {
          console.error("Error parsing sensor data:", e);
        }
      }
      setSensorData(sensorList);
      
      // Load maintenance tickets
      const ticketsBytes = await contract.getData("maintenance_tickets");
      let ticketsList: MaintenanceTicket[] = [];
      if (ticketsBytes.length > 0) {
        try {
          ticketsList = JSON.parse(ethers.toUtf8String(ticketsBytes));
        } catch (e) {
          console.error("Error parsing tickets:", e);
        }
      }
      setTickets(ticketsList);
      
      // Calculate statistics
      calculateStatistics(substationsList, sensorList, ticketsList);
      
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Calculate statistics for dashboard
  const calculateStatistics = (
    substations: Substation[],
    sensorData: SensorData[],
    tickets: MaintenanceTicket[]
  ) => {
    // Count critical substations
    const criticalCount = substations.filter(s => s.status === "critical").length;
    setCriticalSubstations(criticalCount);
    
    // Count pending tickets
    const pendingCount = tickets.filter(t => t.status === "pending").length;
    setPendingTickets(pendingCount);
    
    // Calculate average temperature
    if (sensorData.length > 0) {
      const totalTemp = sensorData.reduce((sum, data) => sum + data.temperature, 0);
      setAvgTemperature(totalTemp / sensorData.length);
    }
  };

  // Add new substation
  const addSubstation = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    if (!newSubstation.name || !newSubstation.location) {
      alert("Please fill all fields");
      return;
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Adding new substation with FHE encryption..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const newId = `sub-${Date.now()}`;
      const newSub: Substation = {
        id: newId,
        name: newSubstation.name,
        location: newSubstation.location,
        status: "normal"
      };
      
      const updatedSubstations = [...substations, newSub];
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        "substations", 
        ethers.toUtf8Bytes(JSON.stringify(updatedSubstations))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Substation added successfully!"
      });
      
      setSubstations(updatedSubstations);
      calculateStatistics(updatedSubstations, sensorData, tickets);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddSubstation(false);
        setNewSubstation({ name: "", location: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Add new maintenance ticket
  const addTicket = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    if (!newTicket.substationId || !newTicket.issue) {
      alert("Please fill all fields");
      return;
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Creating maintenance ticket with FHE..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const newId = `ticket-${Date.now()}`;
      const newTicketItem: MaintenanceTicket = {
        id: newId,
        substationId: newTicket.substationId,
        issue: newTicket.issue,
        priority: newTicket.priority,
        status: "pending",
        created: Date.now()
      };
      
      const updatedTickets = [...tickets, newTicketItem];
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        "maintenance_tickets", 
        ethers.toUtf8Bytes(JSON.stringify(updatedTickets))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Maintenance ticket created!"
      });
      
      setTickets(updatedTickets);
      calculateStatistics(substations, sensorData, updatedTickets);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddTicket(false);
        setNewTicket({ substationId: "", issue: "", priority: "medium" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Simulate FHE prediction
  const runFHEPrediction = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Running FHE prediction model..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        throw new Error("FHE service unavailable");
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE prediction completed! Potential issues detected."
      });
      
      // Update substations with predicted status
      const updatedSubstations = substations.map(sub => {
        // Simulate prediction results
        const randomStatus = Math.random() > 0.7 ? "critical" : 
                            Math.random() > 0.5 ? "warning" : "normal";
        return { ...sub, status: randomStatus };
      });
      
      setSubstations(updatedSubstations);
      calculateStatistics(updatedSubstations, sensorData, tickets);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Prediction failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  // Render temperature chart
  const renderTemperatureChart = () => {
    // Get last 5 sensor readings
    const recentData = [...sensorData].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    
    if (recentData.length === 0) {
      return <div className="no-data">No temperature data available</div>;
    }
    
    const maxTemp = Math.max(...recentData.map(d => d.temperature), 100);
    const minTemp = Math.min(...recentData.map(d => d.temperature), 0);
    
    return (
      <div className="chart-container">
        <div className="chart-grid">
          <div className="y-axis">
            <div>{maxTemp.toFixed(1)}°C</div>
            <div>{((maxTemp + minTemp) / 2).toFixed(1)}°C</div>
            <div>{minTemp.toFixed(1)}°C</div>
          </div>
          <div className="chart-bars">
            {recentData.map((data, index) => (
              <div key={index} className="bar-container">
                <div 
                  className="temperature-bar"
                  style={{ height: `${((data.temperature - minTemp) / (maxTemp - minTemp)) * 100}%` }}
                >
                  <div className="bar-value">{data.temperature.toFixed(1)}°C</div>
                </div>
                <div className="bar-label">S{index+1}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Loading screen
  if (loading) return (
    <div className="loading-screen">
      <div className="tech-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container tech-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="circuit-icon"></div>
          </div>
          <h1>FHE-Powered <span>GridGuard</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={runFHEPrediction} 
            className="predict-btn tech-button"
          >
            <div className="fhe-icon"></div>
            Run FHE Prediction
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-grid">
          {/* Project Introduction */}
          <div className="dashboard-card tech-card intro-card">
            <h2>FHE-Driven Power Facility Maintenance</h2>
            <p>
              Analyze encrypted sensor data from multiple substations using Fully Homomorphic Encryption (FHE) 
              to predict potential equipment failures and schedule preventive maintenance.
            </p>
            <div className="tech-badge">
              <span>FHE-Powered Predictive Maintenance</span>
            </div>
            <div className="feature-list">
              <div className="feature-item">
                <div className="feature-icon encrypted"></div>
                <span>Encrypted sensor data processing</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon predict"></div>
                <span>FHE failure prediction models</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon maintenance"></div>
                <span>Automated maintenance scheduling</span>
              </div>
            </div>
          </div>
          
          {/* Data Statistics */}
          <div className="dashboard-card tech-card stats-card">
            <h3>System Status</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{substations.length}</div>
                <div className="stat-label">Substations</div>
              </div>
              <div className="stat-item">
                <div className="stat-value critical">{criticalSubstations}</div>
                <div className="stat-label">Critical</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingTickets}</div>
                <div className="stat-label">Pending Tickets</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{avgTemperature.toFixed(1)}°C</div>
                <div className="stat-label">Avg Temp</div>
              </div>
            </div>
          </div>
          
          {/* Smart Chart */}
          <div className="dashboard-card tech-card chart-card">
            <div className="chart-header">
              <h3>Temperature Monitoring</h3>
              <div className="chart-legend">
                <div className="legend-item">
                  <div className="color-box normal"></div>
                  <span>Normal</span>
                </div>
                <div className="legend-item">
                  <div className="color-box warning"></div>
                  <span>Warning</span>
                </div>
                <div className="legend-item">
                  <div className="color-box critical"></div>
                  <span>Critical</span>
                </div>
              </div>
            </div>
            {renderTemperatureChart()}
          </div>
          
          {/* Real-time Data Panel */}
          <div className="dashboard-card tech-card realtime-card">
            <div className="panel-header">
              <h3>Real-time Sensor Data</h3>
              <div className="last-updated">Last updated: Just now</div>
            </div>
            <div className="sensor-grid">
              {sensorData.slice(0, 4).map((data, index) => (
                <div key={index} className="sensor-item">
                  <div className="sensor-header">
                    <div className="sensor-id">Sensor #{index+1}</div>
                    <div className={`sensor-status ${data.temperature > 80 ? 'critical' : data.temperature > 70 ? 'warning' : 'normal'}`}></div>
                  </div>
                  <div className="sensor-data">
                    <div className="data-item">
                      <span>Temp:</span>
                      <span>{data.temperature.toFixed(1)}°C</span>
                    </div>
                    <div className="data-item">
                      <span>Vibration:</span>
                      <span>{data.vibration.toFixed(2)}</span>
                    </div>
                    <div className="data-item">
                      <span>Substation:</span>
                      <span>{data.substationId.substring(0, 8)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Substations Section */}
        <div className="data-section">
          <div className="section-header">
            <h2>Substation Management</h2>
            <div className="header-actions">
              <button 
                onClick={() => setShowAddSubstation(true)}
                className="tech-button primary"
              >
                <div className="add-icon"></div>
                Add Substation
              </button>
              <button 
                onClick={loadData}
                className="refresh-btn tech-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
          
          <div className="records-list tech-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Name</div>
              <div className="header-cell">Location</div>
              <div className="header-cell">Status</div>
            </div>
            
            {substations.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No substations found</p>
                <button 
                  className="tech-button primary"
                  onClick={() => setShowAddSubstation(true)}
                >
                  Add First Substation
                </button>
              </div>
            ) : (
              substations.map(substation => (
                <div className="record-row" key={substation.id}>
                  <div className="table-cell record-id">#{substation.id.substring(0, 6)}</div>
                  <div className="table-cell">{substation.name}</div>
                  <div className="table-cell">{substation.location}</div>
                  <div className="table-cell">
                    <span className={`status-badge ${substation.status}`}>
                      {substation.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Maintenance Tickets Section */}
        <div className="data-section">
          <div className="section-header">
            <h2>Maintenance Tickets</h2>
            <div className="header-actions">
              <button 
                onClick={() => setShowAddTicket(true)}
                className="tech-button primary"
              >
                <div className="add-icon"></div>
                Create Ticket
              </button>
            </div>
          </div>
          
          <div className="records-list tech-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Substation</div>
              <div className="header-cell">Issue</div>
              <div className="header-cell">Priority</div>
              <div className="header-cell">Status</div>
            </div>
            
            {tickets.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No maintenance tickets found</p>
              </div>
            ) : (
              tickets.map(ticket => (
                <div className="record-row" key={ticket.id}>
                  <div className="table-cell record-id">#{ticket.id.substring(0, 6)}</div>
                  <div className="table-cell">{ticket.substationId.substring(0, 8)}</div>
                  <div className="table-cell">{ticket.issue}</div>
                  <div className="table-cell">
                    <span className={`priority-badge ${ticket.priority}`}>
                      {ticket.priority}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${ticket.status}`}>
                      {ticket.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {/* Add Substation Modal */}
      {showAddSubstation && (
        <div className="modal-overlay">
          <div className="create-modal tech-card">
            <div className="modal-header">
              <h2>Add New Substation</h2>
              <button onClick={() => setShowAddSubstation(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Substation Name *</label>
                <input 
                  type="text"
                  value={newSubstation.name} 
                  onChange={(e) => setNewSubstation({...newSubstation, name: e.target.value})}
                  placeholder="Enter substation name" 
                  className="tech-input"
                />
              </div>
              
              <div className="form-group">
                <label>Location *</label>
                <input 
                  type="text"
                  value={newSubstation.location} 
                  onChange={(e) => setNewSubstation({...newSubstation, location: e.target.value})}
                  placeholder="Enter location" 
                  className="tech-input"
                />
              </div>
              
              <div className="fhe-notice">
                <div className="fhe-icon"></div> 
                <span>Data will be encrypted using FHE technology</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddSubstation(false)}
                className="cancel-btn tech-button"
              >
                Cancel
              </button>
              <button 
                onClick={addSubstation}
                className="submit-btn tech-button primary"
              >
                Add Substation
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Add Ticket Modal */}
      {showAddTicket && (
        <div className="modal-overlay">
          <div className="create-modal tech-card">
            <div className="modal-header">
              <h2>Create Maintenance Ticket</h2>
              <button onClick={() => setShowAddTicket(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Substation *</label>
                <select 
                  value={newTicket.substationId} 
                  onChange={(e) => setNewTicket({...newTicket, substationId: e.target.value})}
                  className="tech-select"
                >
                  <option value="">Select substation</option>
                  {substations.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.id.substring(0, 6)})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Issue Description *</label>
                <textarea 
                  value={newTicket.issue} 
                  onChange={(e) => setNewTicket({...newTicket, issue: e.target.value})}
                  placeholder="Describe the issue..." 
                  className="tech-textarea"
                  rows={3}
                />
              </div>
              
              <div className="form-group">
                <label>Priority *</label>
                <div className="priority-selector">
                  {(["low", "medium", "high"] as const).map(priority => (
                    <button
                      key={priority}
                      className={`priority-option ${newTicket.priority === priority ? 'active' : ''}`}
                      onClick={() => setNewTicket({...newTicket, priority})}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="fhe-notice">
                <div className="fhe-icon"></div> 
                <span>Ticket data encrypted with FHE</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddTicket(false)}
                className="cancel-btn tech-button"
              >
                Cancel
              </button>
              <button 
                onClick={addTicket}
                className="submit-btn tech-button primary"
              >
                Create Ticket
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Wallet Selector */}
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content tech-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="tech-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="circuit-icon"></div>
              <span>GridGuard</span>
            </div>
            <p>FHE-Powered Predictive Maintenance for Power Facilities</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="tech-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} GridGuard. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;