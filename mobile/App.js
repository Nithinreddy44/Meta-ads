import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput
} from 'react-native';
import io from 'socket.io-client';

// Default host based on platform
const DEFAULT_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_HOST);
  const [isConnected, setIsConnected] = useState(false);
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const socketRef = useRef(null);

  // Connect to Backend WebSocket
  useEffect(() => {
    connectToBackend(serverUrl);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [serverUrl]);

  const connectToBackend = (url) => {
    setIsLoading(true);

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    // 1. Fetch initial leads via REST API
    fetch(`${url}/leads`)
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.data)) {
          setLeads(data.data);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.warn('REST Hydration failed:', err.message);
        setIsLoading(false);
      });

    // 2. Establish persistent WebSocket connection
    const socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socket.on('connect', () => {
      console.log('Mobile connected to backend socket');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Mobile disconnected from backend');
      setIsConnected(false);
    });

    // 3. THE REAL-TIME LEAD LISTENER (Instant prepending)
    socket.on('new_lead', (newLead) => {
      console.log('Mobile received new lead:', newLead);
      setLeads((prevLeads) => [newLead, ...prevLeads]);
    });

    socket.on('leads_cleared', () => {
      setLeads([]);
    });

    socketRef.current = socket;
  };

  const handleSimulateFromMobile = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/simulate-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Mobile App Lead',
          email: 'mobile.prospect@gmail.com',
          phone: '+1 (555) 902-1430',
          formName: 'Mobile Instant Form',
          source: 'Meta Mobile Lead Ad'
        })
      });
      await res.json();
    } catch (err) {
      Alert.alert('Simulation Error', err.message);
    }
  };

  const renderLeadItem = ({ item }) => {
    const initials = item.name
      ? item.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
      : 'LD';

    return (
      <View style={styles.leadCard}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.headerDetails}>
            <Text style={styles.leadName}>{item.name}</Text>
            <Text style={styles.campaignText}>{item.source || 'Meta Lead Ads'}</Text>
          </View>
          <View style={styles.stagePill}>
            <Text style={styles.stageText}>New</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <Text style={styles.infoValue}>{item.email}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone:</Text>
            <Text style={styles.infoValue}>{item.phone}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Form:</Text>
            <Text style={styles.infoValue}>{item.formName || 'Instant Form'}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.idText}>ID: {item.leadId}</Text>
          <Text style={styles.timeText}>
            {new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Top Meta App Header */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.appTitle}>Meta Lead Center</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isConnected ? styles.dotConnected : styles.dotDisconnected]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Live WebSocket Active' : 'Connecting to Server...'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.testBtn} onPress={handleSimulateFromMobile}>
          <Text style={styles.testBtnText}>+ Test Lead</Text>
        </TouchableOpacity>
      </View>

      {/* Server Config Strip */}
      <TouchableOpacity
        style={styles.serverStrip}
        onPress={() => setIsEditingUrl(!isEditingUrl)}
      >
        <Text style={styles.serverStripText}>
          Connected Host: <Text style={styles.boldText}>{serverUrl}</Text> (Tap to change)
        </Text>
      </TouchableOpacity>

      {isEditingUrl && (
        <View style={styles.urlEditor}>
          <TextInput
            style={styles.urlInput}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://192.168.1.X:4000"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => {
              setIsEditingUrl(false);
              connectToBackend(serverUrl);
            }}
          >
            <Text style={styles.saveBtnText}>Connect</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Leads List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0866ff" />
          <Text style={styles.loadingText}>Syncing with Meta Webhooks...</Text>
        </View>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(item) => item.leadId}
          renderItem={renderLeadItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Leads Yet</Text>
              <Text style={styles.emptyDesc}>
                Submit a test lead from Meta Lead Ads Testing Tool or tap "+ Test Lead" above to see it appear live.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5'
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e6eb'
  },
  appTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#050505'
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  dotConnected: {
    backgroundColor: '#31a24c'
  },
  dotDisconnected: {
    backgroundColor: '#f7b125'
  },
  statusText: {
    fontSize: 12,
    color: '#65676b',
    fontWeight: '500'
  },
  testBtn: {
    backgroundColor: '#0866ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6
  },
  testBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13
  },
  serverStrip: {
    backgroundColor: '#e7f3ff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#c7e1fc'
  },
  serverStripText: {
    fontSize: 11,
    color: '#1877f2'
  },
  boldText: {
    fontWeight: '700'
  },
  urlEditor: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e4e6eb'
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 13,
    marginRight: 8
  },
  saveBtn: {
    backgroundColor: '#0866ff',
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 6
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12
  },
  listContent: {
    padding: 14,
    gap: 10
  },
  leadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e4e6eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e7f3ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10
  },
  avatarText: {
    color: '#0866ff',
    fontWeight: '700',
    fontSize: 14
  },
  headerDetails: {
    flex: 1
  },
  leadName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#050505'
  },
  campaignText: {
    fontSize: 12,
    color: '#65676b'
  },
  stagePill: {
    backgroundColor: '#e7f3ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12
  },
  stageText: {
    color: '#0866ff',
    fontSize: 11,
    fontWeight: '700'
  },
  cardBody: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f2f5',
    paddingVertical: 8,
    gap: 4
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  infoLabel: {
    fontSize: 12,
    color: '#8a8d91',
    fontWeight: '500'
  },
  infoValue: {
    fontSize: 12,
    color: '#050505',
    fontWeight: '600'
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  idText: {
    fontSize: 11,
    color: '#8a8d91',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  timeText: {
    fontSize: 11,
    color: '#31a24c',
    fontWeight: '600'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    color: '#65676b',
    fontSize: 13
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 20
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#050505',
    marginBottom: 6
  },
  emptyDesc: {
    fontSize: 13,
    color: '#65676b',
    textAlign: 'center',
    lineHeight: 18
  }
});
