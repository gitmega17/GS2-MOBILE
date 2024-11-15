import 'chart.js/auto';
import React, { useEffect, useState } from 'react';
import { Bar, Line, Pie } from 'react-chartjs-2';
import { Picker, ScrollView, StyleSheet, Text, View } from 'react-native';
import io from 'socket.io-client';

export default function GraphScreen({ route }) {
    const [sensorData, setSensorData] = useState([]);
    const [chartType, setChartType] = useState('line');
    const [timeRange, setTimeRange] = useState('lastHour');
    const { token } = route.params;

    // Mapeamento dos sensores pelos andares
    const sensorNames = {
        1: 'Andar 1',  // Primeiro andar
        2: 'Andar 2',  // Segundo andar
        3: 'Andar 3',  // Terceiro andar
        4: 'Andar 4',  // Quarto andar
        5: 'Andar 5',  // Quinto andar
    };

    const sensorColors = {
        1: 'rgba(0, 123, 255, 0.5)', // Andar 1: Azul
        2: 'rgba(40, 167, 69, 0.5)', // Andar 2: Verde
        3: 'rgba(255, 159, 64, 0.5)', // Andar 3: Laranja
        4: 'rgba(255, 205, 86, 0.5)', // Andar 4: Amarelo
        5: 'rgba(128, 0, 128, 0.5)', // Andar 5: Roxo
    };

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const response = await fetch('http://localhost:3000/dados-sensores', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                if (!response.ok) {
                    throw new Error('Falha ao buscar dados do servidor');
                }
                const data = await response.json();
                setSensorData(data);
            } catch (error) {
                console.error('Erro ao buscar dados iniciais:', error);
            }
        };

        fetchInitialData();

        const socket = io('http://localhost:3000', {
            auth: {
                token: `Bearer ${token}`,
            }
        });

        socket.on('connect', () => {
            console.log('Conectado ao servidor:', socket.id);
        });

        socket.on('sensorDataUpdate', (newData) => {
            console.log('Dados de sensor recebidos:', newData);
            setSensorData(prevData => {
                const existingSensorIndex = prevData.findIndex(item => item.id === newData.id);
                if (existingSensorIndex === -1) {
                    return [...prevData, newData];
                } else {
                    const updatedData = [...prevData];
                    updatedData[existingSensorIndex] = newData;
                    return updatedData;
                }
            });
        });

        return () => {
            socket.disconnect();
        };
    }, [token]);

    // Filtra os dados de acordo com o intervalo de tempo selecionado
    const getFilteredData = () => {
        const now = new Date();
        return sensorData.filter(item => {
            const itemDate = new Date(item.timestamp);
            switch (timeRange) {
                case 'lastHour':
                    return itemDate >= new Date(now - 60 * 60 * 1000);
                case 'last24Hours':
                    return itemDate >= new Date(now - 24 * 60 * 60 * 1000);
                case 'lastWeek':
                    return itemDate >= new Date(now - 7 * 24 * 60 * 60 * 1000);
                case 'last30Days':
                    return itemDate >= new Date(now - 30 * 24 * 60 * 60 * 1000);
                case 'last60Seconds':
                    return itemDate >= new Date(now - 60 * 1000);
                default:
                    return true;
            }
        });
    };

    // Agrupa os dados por floor_id (andar)
    const getGroupedData = () => {
        const filteredData = getFilteredData();
        const groupedData = {};

        filteredData.forEach(item => {
            const { floor_id } = item;
            if (!groupedData[floor_id]) {
                groupedData[floor_id] = [];
            }
            groupedData[floor_id].push(item);
        });

        return groupedData;
    };

    const groupedData = getGroupedData();

    // Função para calcular a média das temperaturas
    const calculateAverageTemperature = (data) => {
        const totalTemperature = data.reduce((sum, item) => sum + item.temperature, 0);
        return totalTemperature / data.length || 0;
    };

    // Função para determinar o nível de consumo energético
    const getEnergyConsumptionLevel = (averageTemperature) => {
        if (averageTemperature < 18) return 'Baixo';
        if (averageTemperature < 25) return 'Moderado';
        return 'Alto';
    };

    // Função para renderizar gráficos para cada andar
    const renderCharts = () => {
        if (chartType === 'pie') {
            // Gráfico de pizza - Média das temperaturas por andar
            const pieData = {
                labels: Object.keys(groupedData).map(floorId => sensorNames[floorId]),
                datasets: [
                    {
                        label: 'Temperatura Média por Andar',
                        data: Object.keys(groupedData).map(floorId => calculateAverageTemperature(groupedData[floorId])),
                        backgroundColor: Object.keys(groupedData).map(floorId => sensorColors[floorId]),
                    },
                ],
            };

            const options = {
                responsive: true,
            };

            return (
                <View style={styles.chartContainer}>
                    <Text style={styles.sensorTitle}>Gráfico de Pizza dos Andares</Text>
                    <Pie data={pieData} options={options} />
                </View>
            );
        }

        return Object.keys(groupedData).map(floorId => {
            const data = {
                labels: groupedData[floorId].map(item => new Date(item.timestamp).toLocaleTimeString()),
                datasets: [
                    {
                        label: `Temperatura (${sensorNames[floorId]})`,
                        data: groupedData[floorId].map(item => item.temperature),
                        borderColor: sensorColors[floorId],
                        backgroundColor: sensorColors[floorId],
                        fill: chartType === 'area',
                        tension: 0.1,
                    },
                ],
            };

            const options = {
                responsive: true,
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tempo',
                        },
                    },
                    y: {
                        stacked: chartType === 'area',
                        title: {
                            display: true,
                            text: 'Temperatura (°C)',
                        },
                        beginAtZero: true,
                    },
                },
            };

            const averageTemperature = calculateAverageTemperature(groupedData[floorId]);
            const energyLevel = getEnergyConsumptionLevel(averageTemperature);

            return (
                <View key={floorId} style={styles.chartContainer}>
                    <Text style={styles.sensorTitle}>Gráfico do {sensorNames[floorId]}</Text>
                    {chartType === 'line' ? (
                        <Line data={data} options={options} />
                    ) : chartType === 'bar' ? (
                        <Bar data={data} options={options} />
                    ) : chartType === 'area' ? (
                        <Line data={data} options={options} />
                    ) : null}

                    <Text style={styles.energyInfo}>
                        Média de Temperatura: {averageTemperature.toFixed(2)}°C | Consumo Energético: {energyLevel}
                    </Text>
                </View>
            );
        });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Gráfico de Dados dos Andares</Text>
            <Text>Yuri Yve RM 551358</Text>

            <Picker
                selectedValue={timeRange}
                style={styles.picker}
                onValueChange={(itemValue) => setTimeRange(itemValue)}
                itemStyle={styles.pickerItem}
            >
                <Picker.Item label="Última Hora" value="lastHour" />
                <Picker.Item label="Últimas 24 Horas" value="last24Hours" />
                <Picker.Item label="Última Semana" value="lastWeek" />
                <Picker.Item label="Últimos 30 Dias" value="last30Days" />
                <Picker.Item label="Últimos 60 Segundos" value="last60Seconds" />
            </Picker>

            <Picker
                selectedValue={chartType}
                style={styles.picker}
                onValueChange={(itemValue) => setChartType(itemValue)}
                itemStyle={styles.pickerItem}
            >
                <Picker.Item label="Linha" value="line" />
                <Picker.Item label="Barra" value="bar" />
                <Picker.Item label="Área" value="area" />
                <Picker.Item label="Pizza" value="pie" />
            </Picker>

            <ScrollView style={styles.scrollView}>
                {renderCharts()}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, backgroundColor: '#f8f9fa' },
    title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
    picker: { height: 50, width: '100%', marginVertical: 10 },
    pickerItem: { fontSize: 18 },
    chartContainer: { marginBottom: 20 },
    sensorTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    energyInfo: { fontSize: 16, marginTop: 10, fontStyle: 'italic' },
    scrollView: { marginTop: 20 },
});
