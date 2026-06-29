<script setup>
import { deepCopy, formatUnit, removeTrailingZeroes } from '/WebSharedComponents/assets/js/utils.js'
import { useTaskQueueStore } from '../../../stores/taskQueue'
import { useModelSettingsStore } from '../../../stores/modelSettings'
import Magnetic2DVisualizer, { PLOT_MODES } from '/WebSharedComponents/Common/Magnetic2DVisualizer.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
</script>

<script>

export default {
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        masStore: {
            type: Object,
            required: true,
        },
        operatingPointIndex: {
            type: Number,
            default: 0,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const modelSettingsStore = useModelSettingsStore();
        const subscriptions = [];
        const dataUptoDate = true;
        const lastSimulatedModels = "";
        const lastSimulatedMagnetics = "";
        const lastSimulatedFrequency = "";

        return {
            taskQueueStore,
            modelSettingsStore,
            subscriptions,
            dataUptoDate,
            PLOT_MODES,
            forceUpdate: 0,
            // Matrix data
            resistanceMatrix: null,
            inductanceMatrix: null,
            leakageInductanceMatrix: null,
            couplingCoefficientMatrix: null,
            // Full capacitance data from MKF
            fullCapacitanceData: null,
            capacitanceError: null,
            // Winding pair selection
            selectedWindingPair: {
                primary: null,
                secondary: null
            },
            isCalculating: false,
            isMounted: false,
            calculatingMatrices: false,
            includeFringing: true,
            lastSimulatedModels,
            lastSimulatedMagnetics,
            lastSimulatedFrequency,
            frequencyData: { frequency: 100000 }, // Object for Dimension component v-model
            isUpdatingResistanceOnly: false, // Flag to prevent interference from other triggers
        }
    },
    computed: {
        resistanceMatrixLatex() {
            if (!this.resistanceMatrix) return null;
            return this.formatMatrixAsLatex(this.resistanceMatrix, 'R');
        },
        inductanceMatrixLatex() {
            if (!this.inductanceMatrix) return null;
            return this.formatMatrixAsLatex(this.inductanceMatrix, 'L');
        },
        leakageInductanceMatrixLatex() {
            if (!this.leakageInductanceMatrix) return null;
            return this.formatMatrixAsLatex(this.leakageInductanceMatrix, 'L_{lk}');
        },
        couplingCoefficientMatrixLatex() {
            if (!this.couplingCoefficientMatrix) return null;
            return this.formatMatrixAsLatex(this.couplingCoefficientMatrix, 'k', '');
        },
        maxwellCapacitanceMatrixLatex() {
            if (!this.maxwellCapacitanceMatrix) return null;
            return this.formatMatrixAsLatex(this.maxwellCapacitanceMatrix, 'C_M');
        },
        // Winding names for dropdowns
        windingNames() {
            const functionalDesc = this.masStore?.mas?.magnetic?.coil?.functionalDescription;
            if (!functionalDesc || !Array.isArray(functionalDesc)) return [];
            return functionalDesc.map(w => w.name).filter(name => name);
        },
        // Winding options as dict: {realName: TitleCaseName} for dropdowns
        windingOptions() {
            const toTitleCase = (str) => {
                if (!str) return '';
                return str.charAt(0).toUpperCase() + str.slice(1);
            };
            const options = {};
            for (const name of this.windingNames) {
                options[name] = toTitleCase(name);
            }
            return options;
        },
        
        // Section 1: Capacitance Matrix (All Windings) - N×N matrix
        capacitanceMatrixAllWindingsLatex() {
            if (!this.fullCapacitanceData?.capacitanceAmongWindings) return null;
            return this.formatMatrixAsLatex(this.fullCapacitanceData.capacitanceAmongWindings, 'C');
        },
        
        // Section 3: Maxwell Capacitance Matrix for selected pair
        maxwellCapacitanceMatrixForSelectedPairLatex() {
            if (!this.fullCapacitanceData?.maxwellCapacitanceMatrix) return null;
            
            const { primary, secondary } = this.selectedWindingPair;
            if (!primary || !secondary) return null;
            
            // maxwellCapacitanceMatrix is an array, get first element
            const maxwellArray = this.fullCapacitanceData.maxwellCapacitanceMatrix;
            if (!Array.isArray(maxwellArray) || maxwellArray.length === 0) return null;
            
            const maxwellMatrix = maxwellArray[0];
            if (!maxwellMatrix?.magnitude) return null;
            
            // Extract 2×2 submatrix for selected windings
            const subMatrix = {};
            if (maxwellMatrix.magnitude[primary]) {
                subMatrix[primary] = {};
                if (maxwellMatrix.magnitude[primary][primary] !== undefined) {
                    subMatrix[primary][primary] = maxwellMatrix.magnitude[primary][primary];
                }
                if (maxwellMatrix.magnitude[primary][secondary] !== undefined) {
                    subMatrix[primary][secondary] = maxwellMatrix.magnitude[primary][secondary];
                }
            }
            if (maxwellMatrix.magnitude[secondary]) {
                subMatrix[secondary] = {};
                if (maxwellMatrix.magnitude[secondary][primary] !== undefined) {
                    subMatrix[secondary][primary] = maxwellMatrix.magnitude[secondary][primary];
                }
                if (maxwellMatrix.magnitude[secondary][secondary] !== undefined) {
                    subMatrix[secondary][secondary] = maxwellMatrix.magnitude[secondary][secondary];
                }
            }
            
            if (Object.keys(subMatrix).length === 0) return null;
            return this.formatMatrixAsLatex(subMatrix, 'C_M');
        },
        
        // Section 4: Tripole Capacitance for selected pair
        threeCapacitorModel() {
            if (!this.fullCapacitanceData?.tripoleCapacitancePerWinding) return null;
            
            const { primary, secondary } = this.selectedWindingPair;
            if (!primary || !secondary) return null;
            
            const tripoleData = this.fullCapacitanceData.tripoleCapacitancePerWinding[primary]?.[secondary];
            if (!tripoleData) return null;
            // NOTE: no console.log here — this is a computed and must stay pure.
            // The global console interceptor pushes into a reactive store that the
            // ConsolePanel renders, so logging from a computed mutates a reactive
            // dep during render → "Maximum recursive updates exceeded".
            const C1 = tripoleData.C1 || tripoleData.c1 || 0;
            const C2 = tripoleData.C2 || tripoleData.c2 || 0;
            const C3 = tripoleData.C3 || tripoleData.c3 || 0;
            
            return {
                C1: C1,
                C2: C2,
                C3: C3,
                C1_valid: C1 > 0,
                C2_valid: C2 > 0,
                C3_valid: C3 > 0,
                configuration: 'B connected to D (reduced circuit)',
                windingNames: [primary, secondary]
            };
        },
        // Section 5: 6 Capacitor Network for selected pair
        sixCapacitorModel() {
            if (!this.fullCapacitanceData?.sixCapacitorNetworkPerWinding) return null;
            
            const { primary, secondary } = this.selectedWindingPair;
            if (!primary || !secondary) return null;
            
            const sixCapData = this.fullCapacitanceData.sixCapacitorNetworkPerWinding[primary]?.[secondary];
            if (!sixCapData) return null;
            // No console.log — computed must stay pure (see threeCapacitorModel).
            const C1 = sixCapData.C1 || sixCapData.c1 || 0;
            const C2 = sixCapData.C2 || sixCapData.c2 || 0;
            const C3 = sixCapData.C3 || sixCapData.c3 || 0;
            const C4 = sixCapData.C4 || sixCapData.c4 || 0;
            const C5 = sixCapData.C5 || sixCapData.c5 || 0;
            const C6 = sixCapData.C6 || sixCapData.c6 || 0;
            
            return {
                // Gamma notation (Cogitore paper)
                gamma1: C1,
                gamma2: C2,
                gamma3: C3,
                gamma4: C4,
                gamma5: C5,
                gamma6: C6,
                // C notation (for schematic labels)
                C1: C1,
                C2: C2,
                C3: C3,
                C4: C4,
                C5: C5,
                C6: C6,
                windingNames: [primary, secondary],
                isComplete: true
            };
        },
        
        // Helper to check if we have multiple windings
        hasMultipleWindings() {
            return this.windingNames.length >= 2;
        },
        numberOfWindings() {
            if (!this.capacitanceMatrix) return 0;
            return Object.keys(this.capacitanceMatrix).length;
        },
        capacitanceModelInfo() {
            const n = this.numberOfWindings;
            if (n === 0) return null;
            if (n === 1) {
                return {
                    description: 'Single winding: Only self-capacitance',
                    numCapacitors: 1,
                    modelType: 'single'
                };
            } else if (n === 2) {
                return {
                    description: 'Two windings: 3-capacitor (reduced) and 6-capacitor (complete) models available',
                    numCapacitors: 6,
                    modelType: 'two-winding',
                    has3Capacitor: true,
                    has6Capacitor: true
                };
            } else {
                // For n windings, the general model needs n(n+1)/2 capacitors
                const numCapacitors = (n * (n + 1)) / 2;
                return {
                    description: `${n} windings: Full model requires ${numCapacitors} capacitors. Only capacitance matrix shown.`,
                    numCapacitors: numCapacitors,
                    modelType: 'multi-winding',
                    has3Capacitor: false,
                    has6Capacitor: false
                };
            }
        },
    },
    watch: {
        'operatingPointIndex': {
            handler(newValue, oldValue) {
                this.updateFields(this.masStore.mas.outputs);
            },
          deep: true
        },
        'frequencyData.frequency': {
            handler(newValue, oldValue) {
                if (newValue !== oldValue && this.isMounted) {
                    console.log('[AdvancedCoilInfo] Frequency changed to', newValue, 'recalculating resistance matrix');
                    this.calculateMatrices(true); // true = only update resistance matrix
                }
            }
        },
        // Watch for coil changes (new design, wizard, MAS load) and reset winding selection
        'masStore.mas.magnetic.coil.functionalDescription': {
            handler(newValue, oldValue) {
                if (this.isMounted && JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
                    console.log('[AdvancedCoilInfo] Coil windings changed, resetting winding selection');
                    this.initializeWindingSelection();
                }
            },
            deep: true
        },
    },
    mounted () {
        this.isMounted = true;
        
        // Initialize frequency from operating point
        const operatingPoint = this.masStore?.mas?.inputs?.operatingPoints?.[this.operatingPointIndex || 0];
        const defaultFrequency = operatingPoint?.excitationsPerWinding?.[0]?.frequency || 100000;
        this.frequencyData.frequency = defaultFrequency;
        console.log('[AdvancedCoilInfo] Initial frequency set to:', this.frequencyData.frequency);
        
        // Initialize winding selection
        this.initializeWindingSelection();
        
        this.subscriptions.push(this.$stateStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "closeCoilAdvancedInfo") {
                    this.$stateStore.magneticBuilder.mode.coil = this.$stateStore.MagneticBuilderModes.Basic;
                }
                if (name == "resimulate") {
                    console.log('[AdvancedCoilInfo] resimulate triggered, recalculating matrices');
                    this.dataUptoDate = false;
                    this.forceUpdate++;
                    // Don't trigger full recalculation if we're in the middle of a resistance-only update
                    if (!this.isUpdatingResistanceOnly) {
                        this.calculateMatrices();
                    }
                }
            });
        }))
        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "wind" || name == "windPlanar") {
                    this.dataUptoDate = false;
                }
                if (name == "wound" || name == "planarWound" || name == "coreShapeProcessed" || name == "coreMaterialProcessed" || name == "coreProcessed") {
                    if (args[0]) {
                        this.dataUptoDate = false;
                        this.forceUpdate++;
                        // Skip calculation on coreProcessed if bobbin regen is pending —
                        // wound action will trigger it after winding with the new bobbin.
                        const skipCalc = name == "coreProcessed" && this.taskQueueStore.bobbinRegenerationPending;
                        if (!skipCalc && !this.isUpdatingResistanceOnly) {
                            this.calculateMatrices();
                        }
                    }
                    else {
                        console.error(args[1])
                        this.dataUptoDate = false;
                    }
                }
            });
        }))
        
        // Initial calculation - wait for modelSettings to be initialized first
        this.waitForModelSettingsAndCalculate();
    },
    beforeUnmount () {
        this.isMounted = false;
        this.isCalculating = false;
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
    waitForModelSettingsAndCalculate() {
        // Wait for modelSettings to be initialized AND have valid models before calculating
        if (this.modelSettingsStore.isInitialized && 
            this.modelSettingsStore.strayCapacitanceModel &&
            Object.keys(this.modelSettingsStore.availableStrayCapacitanceModels).length > 0) {
            if (this.isMounted) {
                this.calculateMatrices();
            }
        } else {
            // Check again in 100ms
            setTimeout(() => this.waitForModelSettingsAndCalculate(), 100);
        }
    },
        onFrequencyUpdate() {
            // The frequency is automatically updated in frequencyData by the Dimension component
            // The watch on frequencyData.frequency will trigger recalculation
            console.log('[AdvancedCoilInfo] Frequency update triggered, new value:', this.frequencyData.frequency);
        },
        formatMatrixAsLatex(matrix, symbol, unit = '') {
            // Determine unit symbol based on matrix type
            const unitSymbol = unit || this.getUnitForSymbol(symbol);
            
            // Determine decimal precision based on symbol type
            // Coupling coefficient (k) should have 5 decimal places
            const decimals = symbol === 'k' ? 5 : 3;
            
            // Get winding names in order from functionalDescription (not alphabetically sorted)
            const orderedWindingNames = this.windingNames;
            
            // Handle the ScalarMatrixAtFrequency format: {frequency: number, magnitude: {name: {name: value}}}
            if (matrix && matrix.magnitude && typeof matrix.magnitude === 'object') {
                const magnitude = matrix.magnitude;
                // Use ordered winding names, filtering to only those present in the matrix
                const matrixKeys = Object.keys(magnitude);
                const windingNamesOrdered = orderedWindingNames.length > 0 
                    ? orderedWindingNames.filter(name => matrixKeys.includes(name))
                    : matrixKeys.sort();
                
                if (windingNamesOrdered.length === 0) {
                    return `${symbol} = \\text{N/A}`;
                }
                
                const rows = windingNamesOrdered.map(rowName => {
                    return windingNamesOrdered.map(colName => {
                        const val = magnitude[rowName]?.[colName];
                        return this.formatValueWithUnit(val, unitSymbol, decimals);
                    }).join(' & ');
                });
                
                return `${symbol} = \\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
            }
            
            // Handle nested capacitance matrix: {windingName: {windingName: value}}
            // This includes both simple numeric values and ScalarMatrixAtFrequency objects
            if (matrix && typeof matrix === 'object' && !Array.isArray(matrix) && !matrix.magnitude) {
                // Use ordered winding names, filtering to only those present in the matrix
                const matrixKeys = Object.keys(matrix);
                const windingNamesOrdered = orderedWindingNames.length > 0 
                    ? orderedWindingNames.filter(name => matrixKeys.includes(name))
                    : matrixKeys.sort();
                
                if (windingNamesOrdered.length === 0) {
                    return `${symbol} = \\text{N/A}`;
                }
                
                // Check if this is the nested capacitance structure
                const firstWinding = matrix[windingNamesOrdered[0]];
                if (firstWinding && typeof firstWinding === 'object') {
                    const secondLevelKeys = Object.keys(firstWinding);
                    if (secondLevelKeys.length > 0) {
                        const sample = firstWinding[secondLevelKeys[0]];
                        
                        // Case 1: ScalarMatrixAtFrequency with magnitude property (detailed turn-level data)
                        if (sample && sample.magnitude) {
                            const rows = windingNamesOrdered.map(rowName => {
                                return windingNamesOrdered.map(colName => {
                                    const scalarMatrix = matrix[rowName]?.[colName];
                                    let val = null;
                                    if (scalarMatrix && scalarMatrix.magnitude) {
                                        // Sum all nominal values to get total capacitance
                                        let total = 0;
                                        for (const turn1 in scalarMatrix.magnitude) {
                                            const turn1Data = scalarMatrix.magnitude[turn1];
                                            if (turn1Data && typeof turn1Data === 'object') {
                                                for (const turn2 in turn1Data) {
                                                    const turn2Data = turn1Data[turn2];
                                                    if (turn2Data && turn2Data.nominal !== undefined) {
                                                        total += turn2Data.nominal;
                                                    }
                                                }
                                            }
                                        }
                                        val = total;
                                    }
                                    return this.formatValueWithUnit(val, unitSymbol, decimals);
                                }).join(' & ');
                            });
                            
                            return `${symbol} = \\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
                        }
                        
                        // Case 2: Simple numeric values (capacitanceAmongWindings structure)
                        if (typeof sample === 'number' || (typeof sample === 'object' && sample !== null && 'nominal' in sample)) {
                            const rows = windingNamesOrdered.map(rowName => {
                                return windingNamesOrdered.map(colName => {
                                    const val = matrix[rowName]?.[colName];
                                    return this.formatValueWithUnit(val, unitSymbol, decimals);
                                }).join(' & ');
                            });
                            
                            return `${symbol} = \\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
                        }
                    }
                }
                
                return `${symbol} = \\text{Complex structure}`;
            }
            
            // Legacy array-based matrix format
            if (!matrix || !Array.isArray(matrix) || matrix.length === 0) {
                return `${symbol} = \\text{N/A}`;
            }
            
            const rows = matrix.map(row => {
                if (Array.isArray(row)) {
                    return row.map(val => this.formatValueWithUnit(val, unitSymbol, decimals)).join(' & ');
                }
                return this.formatValueWithUnit(row, unitSymbol, decimals);
            });
            
            return `${symbol} = \\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
        },
        getUnitForSymbol(symbol) {
            const unitMap = {
                'R': 'Ω',
                'L': 'H',
                'L_{lk}': 'H',
                'C': 'F',
                'C_M': 'F'
            };
            return unitMap[symbol] || '';
        },
        swapIncludeFringing() {
            this.includeFringing = !this.includeFringing;
        },
        formatValueWithUnit(val, unitSymbol, decimals = 3) {
            if (val === null || val === undefined) return '0';
            
            // Handle object with nominal property
            let num = val;
            if (typeof val === 'object') {
                if (val.nominal !== undefined) {
                    num = val.nominal;
                } else if (val.value !== undefined) {
                    num = val.value;
                } else {
                    return '0';
                }
            }
            
            // Ensure num is a number
            if (typeof num !== 'number' || isNaN(num)) {
                num = parseFloat(num);
                if (isNaN(num)) return '0';
            }
            
            if (Math.abs(num) < 1e-15) return '0';
            
            // Handle dimensionless values (empty unit)
            if (!unitSymbol || unitSymbol === '') {
                // Format as plain number with reasonable precision
                if (Math.abs(num) >= 0.01 && Math.abs(num) < 1000) {
                    return num.toFixed(decimals).replace(/\.?0+$/, '');
                }
                return num.toExponential(2);
            }
            
            // Use formatUnit for proper scaling and removeTrailingZeroes for clean display
            const { label, unit } = formatUnit(num, unitSymbol);
            const cleanLabel = removeTrailingZeroes(label, decimals);
            
            // Convert unit to LaTeX, properly handling Greek letters outside \text{}
            // Split unit into parts: prefix (text) + base unit (may have Greek)
            const latexUnit = this.convertUnitToLatex(unit);
            
            return `${cleanLabel}\\,${latexUnit}`;
        },
        convertUnitToLatex(unit) {
            // Map of Unicode to LaTeX commands (must be outside \text{})
            const greekMap = {
                'Ω': '\\Omega',
                'μ': '\\mu',
                '°': '^{\\circ}'
            };
            
            // Build LaTeX string, wrapping non-Greek chars in \text{} and Greek in math mode
            let result = '';
            let textBuffer = '';
            
            for (const char of unit) {
                if (greekMap[char]) {
                    // Flush text buffer first
                    if (textBuffer) {
                        result += `\\text{${textBuffer}}`;
                        textBuffer = '';
                    }
                    result += greekMap[char];
                } else {
                    textBuffer += char;
                }
            }
            
            // Flush remaining text buffer
            if (textBuffer) {
                result += `\\text{${textBuffer}}`;
            }
            
            return result;
        },
        formatValue(val) {
            if (val === null || val === undefined) return '0';
            
            // Handle object with nominal property
            let num = val;
            if (typeof val === 'object') {
                if (val.nominal !== undefined) {
                    num = val.nominal;
                } else if (val.value !== undefined) {
                    num = val.value;
                } else {
                    // Unknown object structure, return 0
                    return '0';
                }
            }
            
            // Ensure num is a number
            if (typeof num !== 'number' || isNaN(num)) {
                num = parseFloat(num);
                if (isNaN(num)) return '0';
            }
            
            if (Math.abs(num) < 1e-12) return '0';
            if (Math.abs(num) >= 1e-3 && Math.abs(num) < 1e6) {
                return num.toFixed(4);
            }
            return num.toExponential(2);
        },
        formatCapacitance(val) {
            // Format capacitance value with appropriate units (F, nF, pF)
            if (val === null || val === undefined) return '0';
            
            let num = val;
            if (typeof val === 'object') {
                if (val.nominal !== undefined) num = val.nominal;
                else if (val.value !== undefined) num = val.value;
                else return '0';
            }
            
            if (typeof num !== 'number' || isNaN(num)) {
                num = parseFloat(num);
                if (isNaN(num)) return '0';
            }
            
            const absVal = Math.abs(num);
            if (absVal < 1e-15) return '0';
            
            // Choose appropriate unit and scale
            if (absVal >= 1e-6) {
                return `${(num * 1e6).toFixed(2)} \\mu\\text{F}`;
            } else if (absVal >= 1e-9) {
                return `${(num * 1e9).toFixed(2)} \\text{nF}`;
            } else if (absVal >= 1e-12) {
                return `${(num * 1e12).toFixed(2)} \\text{pF}`;
            } else {
                return `${num.toExponential(2)} \\text{F}`;
            }
        },
        // Helper to safely set reactive data only if component is still mounted
        safeSet(key, value) {
            if (this.isMounted) {
                this[key] = value;
            }
        },
        async calculateMatrices(onlyResistance = false) {
            // Prevent multiple simultaneous calculations
            if (this.isCalculating) {
                // If we're already calculating and this is a resistance-only update, 
                // let the current calculation finish (it will use the new frequency)
                if (onlyResistance) {
                    return;
                }
                // If we're in the middle of a resistance-only update, wait for it
                if (this.isUpdatingResistanceOnly) {
                    return;
                }
            }
            
            if (onlyResistance) {
                this.isUpdatingResistanceOnly = true;
            }
            
            // Require full magnetic data including core and coil processing
            const magnetic = this.masStore.mas?.magnetic;
            
            if (!magnetic?.coil?.turnsDescription || !magnetic?.core?.processedDescription) {
                return;
            }
            
            // Validate coil has actual turn data
            const hasActualTurns = magnetic.coil.turnsDescription.length > 0 && 
                                   magnetic.coil.turnsDescription[0]?.length > 0;
            
            if (!hasActualTurns) {
                console.warn('[AdvancedCoilInfo] No actual turns data available, skipping matrix calculations');
                return;
            }
            
            // Validate functional description exists
            const hasFunctionalDescription = magnetic.coil.functionalDescription && 
                                            magnetic.coil.functionalDescription.length > 0;
            
            if (!hasFunctionalDescription) {
                console.warn('[AdvancedCoilInfo] No functional description available, skipping matrix calculations');
                return;
            }
            
            // Check for pending simulation models
            const pendingModels = this.$stateStore.pendingSimulationModels;
            console.log('[AdvancedCoilInfo] pendingSimulationModels:', pendingModels);
            
            // Build modelsData with pending models or store values
            const modelsData = {
                coreLosses: this.$userStore?.selectedModels?.['coreLosses'] || 'IGSE',
                coreTemperature: this.$userStore?.selectedModels?.['coreTemperature'] || 'Maniktala',
                gapReluctance: this.$userStore?.selectedModels?.['gapReluctance'] || 'Zhang',
                magneticFieldStrength: pendingModels?.magneticFieldStrengthModel || this.modelSettingsStore.magneticFieldStrengthModel,
                magneticFieldStrengthFringingEffect: pendingModels?.magneticFieldStrengthFringingEffectModel || this.modelSettingsStore.magneticFieldStrengthFringingEffectModel,
                reluctance: pendingModels?.reluctanceModel || this.modelSettingsStore.reluctanceModel,
                strayCapacitance: pendingModels?.strayCapacitanceModel || this.modelSettingsStore.strayCapacitanceModel,
                windingSkinEffectLosses: pendingModels?.windingSkinEffectLossesModel || this.modelSettingsStore.windingSkinEffectLossesModel,
                windingProximityEffectLosses: pendingModels?.windingProximityEffectLossesModel || this.modelSettingsStore.windingProximityEffectLossesModel,
            };
            
            // Check cache to avoid unnecessary recalculation
            const magneticsString = JSON.stringify(magnetic);
            const modelsString = JSON.stringify(modelsData);
            const frequencyString = String(this.frequencyData.frequency);
            
            // Check if we only need to update resistance (frequency change only)
            if (onlyResistance) {
                // For frequency-only updates, we still need to recalculate resistance
                // but skip the cache check and other matrices
                console.log('[AdvancedCoilInfo] Frequency-only update - recalculating only resistance matrix');
            } else if (magneticsString === this.lastSimulatedMagnetics && 
                modelsString === this.lastSimulatedModels) {
                console.log('[AdvancedCoilInfo] Cache hit - skipping matrix recalculation');
                this.dataUptoDate = true;
                return;
            }
            
            console.log('[AdvancedCoilInfo] Cache miss - recalculating matrices with models:', modelsData);
            
            this.isCalculating = true;
            this.calculatingMatrices = true;
            
            try {
                const operatingPoint = this.masStore.mas.inputs?.operatingPoints?.[this.operatingPointIndex];
                // Use the frequency from the input, or fall back to operating point frequency
                const frequency = this.frequencyData.frequency || operatingPoint?.excitationsPerWinding?.[0]?.frequency || 100000;
                const temperature = operatingPoint?.conditions?.ambientTemperature || 25;
                
                // Validate we have required coil data for matrix calculations
                const coil = magnetic.coil;
                const hasLayers = coil.layersDescription && coil.layersDescription.length > 0;
                const hasTurns = coil.turnsDescription && coil.turnsDescription.length > 0;
                
                // Calculate resistance matrix (requires turns with coordinates)
                if (hasTurns) {
                    try {
                        const resistanceData = await this.taskQueueStore.calculateResistanceMatrix(magnetic, temperature, frequency);
                        // Format is {frequency: number, magnitude: {windingName: {windingName: value}}}
                        if (resistanceData && resistanceData.magnitude) {
                            this.safeSet('resistanceMatrix', resistanceData);
                        } else if (resistanceData && Array.isArray(resistanceData)) {
                            this.safeSet('resistanceMatrix', resistanceData);
                        } else {
                            this.safeSet('resistanceMatrix', null);
                        }
                    } catch (e) {
                        console.error('Resistance matrix error:', e.message || e);
                        this.safeSet('resistanceMatrix', null);
                    }
                } else {
                    this.safeSet('resistanceMatrix', null);
                }
                
                // Skip other matrices if only updating resistance
                if (onlyResistance) {
                    this.isCalculating = false;
                    this.calculatingMatrices = false;
                    this.isUpdatingResistanceOnly = false;
                    this.lastSimulatedFrequency = frequencyString;
                    return;
                }
                
                // Calculate inductance matrix (requires core processing)
                if (magnetic.core?.processedDescription?.effectiveParameters) {
                    try {
                        const inductanceData = await this.taskQueueStore.calculateInductanceMatrix(magnetic, frequency, modelsData);
                        // Format is {frequency: number, magnitude: {windingName: {windingName: value}}}
                        if (inductanceData && inductanceData.magnitude) {
                            this.safeSet('inductanceMatrix', inductanceData);
                        } else if (inductanceData && Array.isArray(inductanceData)) {
                            this.safeSet('inductanceMatrix', inductanceData);
                        } else {
                            this.safeSet('inductanceMatrix', null);
                        }
                    } catch (e) {
                        console.error('Inductance matrix error:', e.message || e);
                        this.safeSet('inductanceMatrix', null);
                    }

                    // Calculate leakage inductance matrix
                    try {
                        const leakageInductanceData = await this.taskQueueStore.calculateLeakageInductanceMatrix(magnetic, frequency, modelsData);
                        // Format is {frequency: number, magnitude: {windingName: {windingName: value}}}
                        if (leakageInductanceData && leakageInductanceData.magnitude) {
                            this.safeSet('leakageInductanceMatrix', leakageInductanceData);
                        } else if (leakageInductanceData && Array.isArray(leakageInductanceData)) {
                            this.safeSet('leakageInductanceMatrix', leakageInductanceData);
                        } else {
                            this.safeSet('leakageInductanceMatrix', null);
                        }
                    } catch (e) {
                        console.error('Leakage inductance matrix error:', e.message || e);
                        this.safeSet('leakageInductanceMatrix', null);
                    }

                    // Calculate coupling coefficient matrix
                    try {
                        const couplingData = await this.taskQueueStore.calculateCouplingCoefficientMatrix(magnetic, frequency, modelsData);
                        if (couplingData && couplingData.magnitude) {
                            this.safeSet('couplingCoefficientMatrix', couplingData);
                        } else {
                            this.safeSet('couplingCoefficientMatrix', null);
                        }
                    } catch (e) {
                        console.error('Coupling coefficient matrix error:', e.message || e);
                        this.safeSet('couplingCoefficientMatrix', null);
                    }
                } else {
                    this.safeSet('inductanceMatrix', null);
                    this.safeSet('leakageInductanceMatrix', null);
                    this.safeSet('couplingCoefficientMatrix', null);
                }
                
                // Calculate capacitance matrices (requires layers)
                if (hasLayers && operatingPoint && coil) {
                    try {
                        // Skip if model isn't valid
                        if (!modelsData.strayCapacitance) {
                            console.warn('[AdvancedCoilInfo] No stray capacitance model selected, skipping capacitance calculation');
                            this.safeSet('maxwellCapacitanceMatrix', null);
                            this.safeSet('capacitanceMatrix', null);
                        } else {
                            // Validate coil has required geometric data
                            if (!coil.layersDescription || coil.layersDescription.length === 0) {
                                console.warn('[AdvancedCoilInfo] Coil missing layers description, skipping capacitance calculation');
                                this.safeSet('fullCapacitanceData', null);
                                this.capacitanceError = 'Coil missing layers description';
                            } else {
                                try {
                                    console.log('[AdvancedCoilInfo] Calculating full capacitance data...');
                                    const capacitanceData = await this.taskQueueStore.calculateStrayCapacitance(
                                        coil,
                                        operatingPoint,
                                        modelsData
                                    );
                                    
                                    if (capacitanceData) {
                                        // Store the full capacitance data
                                        this.safeSet('fullCapacitanceData', capacitanceData);
                                        this.capacitanceError = null;
                                        console.log('[AdvancedCoilInfo] Full capacitance data received:', {
                                            hasCapacitanceAmongWindings: !!capacitanceData.capacitanceAmongWindings,
                                            hasMaxwellCapacitanceMatrix: !!(capacitanceData.maxwellCapacitanceMatrix?.length),
                                            hasSixCapacitorNetwork: !!capacitanceData.sixCapacitorNetworkPerWinding,
                                            hasTripoleCapacitance: !!capacitanceData.tripoleCapacitancePerWinding
                                        });
                                        
                                        // Initialize winding selection if not already set
                                        if (!this.selectedWindingPair.primary || !this.selectedWindingPair.secondary) {
                                            this.initializeWindingSelection();
                                        }
                                    } else {
                                        this.safeSet('fullCapacitanceData', null);
                                        this.capacitanceError = 'No capacitance data returned';
                                    }
                                } catch (e) {
                                    console.error('Stray capacitance error:', e.message || e);
                                    this.safeSet('fullCapacitanceData', null);
                                    this.capacitanceError = e.message || 'Failed to calculate capacitance';
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Stray capacitance error:', e.message || e);
                        this.safeSet('fullCapacitanceData', null);
                        this.capacitanceError = e.message || 'Failed to calculate capacitance';
                    }
                } else {
                    this.safeSet('fullCapacitanceData', null);
                    this.capacitanceError = null;
                }
                
                if (this.isMounted) {
                    this.dataUptoDate = true;
                    // Update cache after successful calculation
                    this.lastSimulatedMagnetics = magneticsString;
                    this.lastSimulatedModels = modelsString;
                    this.lastSimulatedFrequency = frequencyString;
                    // Clear pending simulation models so subsequent changes use store values
                    this.$stateStore.pendingSimulationModels = null;
                    console.log('[AdvancedCoilInfo] Cache updated with new models');
                }
            } catch (e) {
                console.error('Error calculating matrices:', e);
            } finally {
                this.isCalculating = false;
                this.isUpdatingResistanceOnly = false;
                if (this.isMounted) {
                    this.calculatingMatrices = false;
                }
            }
        },
        createPlaceholderMatrix(size) {
            const matrix = [];
            for (let i = 0; i < size; i++) {
                const row = [];
                for (let j = 0; j < size; j++) {
                    row.push(i === j ? 1e-6 : 1e-9);
                }
                matrix.push(row);
            }
            return matrix;
        },
        buildInductanceMatrix(leakageInductances) {
            const size = leakageInductances.length;
            const matrix = [];
            for (let i = 0; i < size; i++) {
                const row = [];
                for (let j = 0; j < size; j++) {
                    if (i === j) {
                        // Diagonal: self inductance
                        const val = leakageInductances[i]?.nominal || leakageInductances[i] || 0;
                        row.push(val);
                    } else {
                        // Off-diagonal: mutual inductance (approximation)
                        row.push(0);
                    }
                }
                matrix.push(row);
            }
            return matrix;
        },
        
        // Winding selection methods
        initializeWindingSelection() {
            // Called on: new design, wizard usage, MAS load
            // Reset to default: primary=winding[0], secondary=winding[1]
            const windings = this.windingNames;
            if (windings.length >= 2) {
                this.selectedWindingPair = {
                    primary: windings[0],
                    secondary: windings[1]
                };
            } else {
                this.selectedWindingPair = {
                    primary: null,
                    secondary: null
                };
            }
            console.log('[AdvancedCoilInfo] Winding selection initialized:', this.selectedWindingPair);
        },
        
        onPrimaryWindingChange(newWinding) {
            console.log('[AdvancedCoilInfo] Primary winding changed to:', newWinding);
            // Ensure primary and secondary are not the same
            if (newWinding === this.selectedWindingPair.secondary) {
                // Find a different winding for secondary
                const windings = this.windingNames;
                const differentWinding = windings.find(w => w !== newWinding);
                if (differentWinding) {
                    this.selectedWindingPair.secondary = differentWinding;
                }
            }
            this.selectedWindingPair.primary = newWinding;
        },
        
        onSecondaryWindingChange(newWinding) {
            console.log('[AdvancedCoilInfo] Secondary winding changed to:', newWinding);
            // Ensure primary and secondary are not the same
            if (newWinding === this.selectedWindingPair.primary) {
                // Find a different winding for primary
                const windings = this.windingNames;
                const differentWinding = windings.find(w => w !== newWinding);
                if (differentWinding) {
                    this.selectedWindingPair.primary = differentWinding;
                }
            }
            this.selectedWindingPair.secondary = newWinding;
        },
        
        formatCapacitance(value) {
            if (value === null || value === undefined || value === 0) return '0';
            if (Math.abs(value) < 1e-15) return '0';
            
            // Use formatUnit for proper unit scaling
            const { label, unit } = formatUnit(value, 'F');
            const cleanLabel = removeTrailingZeroes(label, 3);
            return `${cleanLabel} ${unit}`;
        },
    }
}
</script>

<template>
    <div class="advancedcoil-wrapper">
        <div class="advancedcoil-grid" :class="{ 'advancedcoil-dimmed': !dataUptoDate }">
            <!-- Left Column: Resistance -->
            <div class="advancedcoil-card">
                <div class="advancedcoil-card-header">
                    <i class="pi pi-bolt"></i>
                    <span>Resistance</span>
                </div>
                <div class="advancedcoil-card-body">
                    <div class="advancedcoil-plot">
                        <Magnetic2DVisualizer 
                            v-if="masStore.mas?.magnetic?.coil?.turnsDescription"
                            :modelValue="masStore.mas"
                            :forceUpdate="forceUpdate"
                            :operatingPointIndex="operatingPointIndex"
                            :enableZoom="true"
                            :enableOptions="false"
                            :plotModeInit="PLOT_MODES.WIRES_LOSSES"
                            :availablePlotModes="[PLOT_MODES.WIRES_LOSSES]"
                            :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                            :textColor="$styleStore.magneticBuilder.main['color']"
                        />
                        <div v-else class="advancedcoil-placeholder">
                            No coil data available
                        </div>
                    </div>
                    <div v-if="masStore.mas?.magnetic?.coil?.turnsDescription" class="advancedcoil-hint">
                        <i class="pi pi-info-circle"></i> Hover over the image to see values
                    </div>
                    
                    <div class="advancedcoil-freq">
                        <Dimension
                            :name="'frequency'"
                            :replaceTitle="'Frequency'"
                            unit="Hz"
                            :min="1000"
                            :max="10000000"
                            v-model="frequencyData"
                            @update="onFrequencyUpdate"
                            :labelWidthProportionClass="'col-5'"
                            :valueWidthProportionClass="'col-7'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize || '14px'"
                            :labelFontSize="$styleStore.magneticBuilder.inputLabelFontSize || '14px'"
                            :labelBgColor="'transparent'"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor || 'var(--p-gray-700)'"
                            :textColor="$styleStore.magneticBuilder.inputTextColor || 'var(--p-white)'"
                        />
                    </div>
                    
                    <div class="advancedcoil-matrix">
                        <div v-if="calculatingMatrices" class="advancedcoil-loading">
                            <i class="pi pi-refresh fa-spin"></i> Calculating...
                        </div>
                        <vue-latex
                            v-else-if="resistanceMatrixLatex && resistanceMatrix"
                            :expression="resistanceMatrixLatex"
                            :display-mode="true"
                            :fontsize="16"
                        />
                        <div v-else class="advancedcoil-empty">
                            No resistance data available
                        </div>
                    </div>
                </div>
            </div>

            <!-- Middle Column: Leakage Inductance -->
            <div class="advancedcoil-card">
                <div class="advancedcoil-card-header">
                    <i class="pi pi-cog"></i>
                    <span>Leakage Inductance</span>
                </div>
                <div class="advancedcoil-card-body">
                    <div class="advancedcoil-plot">
                        <Magnetic2DVisualizer 
                            v-if="masStore.mas?.magnetic?.coil?.turnsDescription"
                            :modelValue="masStore.mas"
                            :forceUpdate="forceUpdate"
                            :operatingPointIndex="operatingPointIndex"
                            :enableZoom="true"
                            :enableOptions="false"
                            :enableFringingOption="true"
                            :plotModeInit="PLOT_MODES.MAGNETIC_FIELD"
                            :availablePlotModes="[PLOT_MODES.MAGNETIC_FIELD]"
                            :includeFringingInit="includeFringing"
                            @swapIncludeFringing="swapIncludeFringing"
                            :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                            :textColor="$styleStore.magneticBuilder.main['color']"
                        />
                        <div v-else class="advancedcoil-placeholder">
                            No coil data available
                        </div>
                    </div>
                    <div v-if="masStore.mas?.magnetic?.coil?.turnsDescription" class="advancedcoil-hint">
                        <i class="pi pi-info-circle"></i> Hover over the image to see values
                    </div>
                    
                    <div class="advancedcoil-matrix">
                        <span class="advancedcoil-matrix-title">Inductance Matrix</span>
                        <div v-if="calculatingMatrices" class="advancedcoil-loading">
                            <i class="pi pi-refresh fa-spin"></i> Calculating...
                        </div>
                        <vue-latex
                            v-else-if="inductanceMatrixLatex"
                            :expression="inductanceMatrixLatex"
                            :display-mode="true"
                            :fontsize="16"
                        />
                        <div v-else class="advancedcoil-empty">
                            No inductance data
                        </div>
                    </div>
                    
                    <div class="advancedcoil-matrix">
                        <span class="advancedcoil-matrix-title">Leakage Inductance Matrix</span>
                        <div v-if="calculatingMatrices" class="advancedcoil-loading">
                            <i class="pi pi-refresh fa-spin"></i> Calculating...
                        </div>
                        <vue-latex
                            v-else-if="leakageInductanceMatrixLatex"
                            :expression="leakageInductanceMatrixLatex"
                            :display-mode="true"
                            :fontsize="16"
                        />
                        <div v-else class="advancedcoil-empty">
                            No leakage inductance data
                        </div>
                    </div>
                    
                    <div class="advancedcoil-matrix">
                        <span class="advancedcoil-matrix-title">Coupling Coefficient</span>
                        <div v-if="calculatingMatrices" class="advancedcoil-loading">
                            <i class="pi pi-refresh fa-spin"></i> Calculating...
                        </div>
                        <vue-latex
                            v-else-if="couplingCoefficientMatrixLatex"
                            :expression="couplingCoefficientMatrixLatex"
                            :display-mode="true"
                            :fontsize="16"
                        />
                        <div v-else class="advancedcoil-empty">
                            No coupling data
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Column: Stray Capacitance -->
            <div class="advancedcoil-card">
                <div class="advancedcoil-card-header">
                    <i class="pi pi-wifi"></i>
                    <span>Stray Capacitance</span>
                </div>
                <div class="advancedcoil-card-body">
                    <div class="advancedcoil-plot">
                        <Magnetic2DVisualizer 
                            v-if="masStore.mas?.magnetic?.coil?.turnsDescription"
                            :modelValue="masStore.mas"
                            :forceUpdate="forceUpdate"
                            :operatingPointIndex="operatingPointIndex"
                            :enableZoom="true"
                            :enableOptions="false"
                            :plotModeInit="PLOT_MODES.ELECTRIC_FIELD"
                            :availablePlotModes="[PLOT_MODES.ELECTRIC_FIELD]"
                            :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                            :textColor="$styleStore.magneticBuilder.main['color']"
                        />
                        <div v-else class="advancedcoil-placeholder">
                            No coil data available
                        </div>
                    </div>
                    <div v-if="masStore.mas?.magnetic?.coil?.turnsDescription" class="advancedcoil-hint">
                        <i class="pi pi-info-circle"></i> Hover over the image to see values
                    </div>
                    
                    <div class="advancedcoil-matrix">
                        <span class="advancedcoil-matrix-title">Capacitance Matrix (All Windings)</span>
                        <div v-if="calculatingMatrices" class="advancedcoil-loading">
                            <i class="pi pi-refresh fa-spin"></i> Calculating...
                        </div>
                        <vue-latex
                            v-else-if="capacitanceMatrixAllWindingsLatex"
                            :expression="capacitanceMatrixAllWindingsLatex"
                            :display-mode="true"
                            :fontsize="16"
                        />
                        <div v-else-if="capacitanceError" class="advancedcoil-error">
                            Error: {{ capacitanceError }}
                        </div>
                        <div v-else class="advancedcoil-empty">
                            No capacitance data available
                        </div>
                    </div>
                    
                    <div v-if="hasMultipleWindings" class="advancedcoil-pairbox">
                        <div class="advancedcoil-pairbox-title">Select Winding Pair</div>
                        
                        <div class="advancedcoil-pairbox-grid">
                            <div class="advancedcoil-pairbox-field">
                                <label>Primary</label>
                                <select 
                                    v-model="selectedWindingPair.primary"
                                    @change="onPrimaryWindingChange($event.target.value)"
                                >
                                    <option v-for="(displayName, realName) in windingOptions" :key="realName" :value="realName">
                                        {{ displayName }}
                                    </option>
                                </select>
                            </div>
                            <div class="advancedcoil-pairbox-field">
                                <label>Secondary</label>
                                <select 
                                    v-model="selectedWindingPair.secondary"
                                    @change="onSecondaryWindingChange($event.target.value)"
                                >
                                    <option v-for="(displayName, realName) in windingOptions" :key="realName" :value="realName">
                                        {{ displayName }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <div v-else-if="!calculatingMatrices" class="advancedcoil-pairbox advancedcoil-pairbox-empty">
                        Single winding: No inter-winding capacitance models available
                    </div>
                    
                    <div v-if="selectedWindingPair.primary && selectedWindingPair.secondary" class="advancedcoil-matrix">
                        <span class="advancedcoil-matrix-title">Maxwell Capacitance Matrix</span>
                        <span class="advancedcoil-matrix-subtitle">{{ selectedWindingPair.primary }} - {{ selectedWindingPair.secondary }}</span>
                        <div v-if="calculatingMatrices" class="advancedcoil-loading">
                            <i class="pi pi-refresh fa-spin"></i> Calculating...
                        </div>
                        <vue-latex
                            v-else-if="maxwellCapacitanceMatrixForSelectedPairLatex"
                            :expression="maxwellCapacitanceMatrixForSelectedPairLatex"
                            :display-mode="true"
                            :fontsize="16"
                        />
                        <div v-else class="advancedcoil-empty">
                            No Maxwell matrix for selected pair
                        </div>
                    </div>
                    
                    <div v-if="threeCapacitorModel" class="advancedcoil-circuit">
                        <div class="advancedcoil-circuit-header">Tripole Capacitance</div>
                        <div class="advancedcoil-circuit-subtitle">{{ threeCapacitorModel.windingNames[0] }} - {{ threeCapacitorModel.windingNames[1] }}</div>
                        
                        <svg viewBox="0 0 320 230" class="advancedcoil-circuit-svg">
                            <circle cx="60" cy="40" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="48" y="35" font-size="14" fill="var(--p-white)" font-weight="bold">A</text>
                            
                            <circle cx="60" cy="160" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="48" y="175" font-size="14" fill="var(--p-white)" font-weight="bold">B</text>
                            
                            <line x1="60" y1="40" x2="100" y2="40" stroke="var(--p-white)" stroke-width="2"/>
                            <line x1="60" y1="160" x2="100" y2="160" stroke="var(--p-white)" stroke-width="2"/>
                            
                            <path d="M 100 40 Q 115 40 115 52 Q 115 64 100 64 Q 85 64 85 76 Q 85 88 100 88 Q 115 88 115 100 Q 115 112 100 112 Q 85 112 85 124 Q 85 136 100 136 Q 115 136 115 148 Q 115 160 100 160" 
                                  stroke="var(--p-white)" stroke-width="2" fill="none"/>
                            
                            <line x1="150" y1="50" x2="150" y2="150" stroke="var(--p-white)" stroke-width="3"/>
                            <line x1="165" y1="50" x2="165" y2="150" stroke="var(--p-white)" stroke-width="3"/>
                            
                            <path d="M 215 40 Q 200 40 200 52 Q 200 64 215 64 Q 230 64 230 76 Q 230 88 215 88 Q 200 88 200 100 Q 200 112 215 112 Q 230 112 230 124 Q 230 136 215 136 Q 200 136 200 148 Q 200 160 215 160" 
                                  stroke="var(--p-white)" stroke-width="2" fill="none"/>
                            
                            <line x1="215" y1="40" x2="255" y2="40" stroke="var(--p-white)" stroke-width="2"/>
                            <line x1="215" y1="160" x2="255" y2="160" stroke="var(--p-white)" stroke-width="2"/>
                            
                            <circle cx="255" cy="40" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="265" y="35" font-size="14" fill="var(--p-white)" font-weight="bold">C</text>
                            
                            <circle cx="255" cy="160" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="265" y="175" font-size="14" fill="var(--p-white)" font-weight="bold">D</text>
                            
                            <line x1="5" y1="92" x2="35" y2="92" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="5" y1="108" x2="35" y2="108" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="20" y1="40" x2="20" y2="92" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="20" y1="108" x2="20" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="40" x2="20" y2="40" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="160" x2="20" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="40" y="102" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₁</text>
                            
                            <line x1="285" y1="92" x2="315" y2="92" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="285" y1="108" x2="315" y2="108" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="300" y1="40" x2="300" y2="92" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="300" y1="108" x2="300" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="40" x2="300" y2="40" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="160" x2="300" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="265" y="102" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₂</text>
                            
                            <line x1="147" y1="174" x2="147" y2="198" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="163" y1="174" x2="163" y2="198" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="60" y1="186" x2="147" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="147" y1="186" x2="147" y2="174" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="186" x2="163" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="163" y1="186" x2="163" y2="174" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="160" x2="60" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="160" x2="255" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="172" y="168" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₃</text>
                        </svg>
                        
                        <div class="advancedcoil-circuit-values">
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_1 = ${formatCapacitance(threeCapacitorModel.C1)}`" :fontsize="13" />
                            </div>
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_2 = ${formatCapacitance(threeCapacitorModel.C2)}`" :fontsize="13" />
                            </div>
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_3 = ${formatCapacitance(threeCapacitorModel.C3)}`" :fontsize="13" />
                            </div>
                        </div>
                    </div>
                    
                    <div v-if="sixCapacitorModel && sixCapacitorModel.isComplete" class="advancedcoil-circuit">
                        <div class="advancedcoil-circuit-header">6 Capacitor Network</div>
                        <div class="advancedcoil-circuit-subtitle">{{ sixCapacitorModel.windingNames[0] }} - {{ sixCapacitorModel.windingNames[1] }}</div>
                        
                        <svg viewBox="0 0 320 240" class="advancedcoil-circuit-svg">
                            <circle cx="60" cy="40" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="48" y="35" font-size="14" fill="var(--p-white)" font-weight="bold">A</text>
                            
                            <circle cx="60" cy="160" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="48" y="175" font-size="14" fill="var(--p-white)" font-weight="bold">B</text>
                            
                            <path d="M 100 40 Q 115 40 115 52 Q 115 64 100 64 Q 85 64 85 76 Q 85 88 100 88 Q 115 88 115 100 Q 115 112 100 112 Q 85 112 85 124 Q 85 136 100 136 Q 115 136 115 148 Q 115 160 100 160" 
                                  stroke="var(--p-white)" stroke-width="2" fill="none" opacity="0.25"/>
                            
                            <line x1="150" y1="50" x2="150" y2="150" stroke="var(--p-white)" stroke-width="3" opacity="0.25"/>
                            <line x1="165" y1="50" x2="165" y2="150" stroke="var(--p-white)" stroke-width="3" opacity="0.25"/>
                            
                            <path d="M 215 40 Q 200 40 200 52 Q 200 64 215 64 Q 230 64 230 76 Q 230 88 215 88 Q 200 88 200 100 Q 200 112 215 112 Q 230 112 230 124 Q 230 136 215 136 Q 200 136 200 148 Q 200 160 215 160" 
                                  stroke="var(--p-white)" stroke-width="2" fill="none" opacity="0.25"/>
                            
                            <line x1="60" y1="40" x2="100" y2="40" stroke="var(--p-white)" stroke-width="2" opacity="0.25"/>
                            <line x1="60" y1="160" x2="100" y2="160" stroke="var(--p-white)" stroke-width="2" opacity="0.25"/>
                            
                            <line x1="215" y1="40" x2="255" y2="40" stroke="var(--p-white)" stroke-width="2" opacity="0.25"/>
                            <line x1="215" y1="160" x2="255" y2="160" stroke="var(--p-white)" stroke-width="2" opacity="0.25"/>
                            
                            <circle cx="255" cy="40" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="265" y="35" font-size="14" fill="var(--p-white)" font-weight="bold">C</text>
                            
                            <circle cx="255" cy="160" r="4" fill="var(--p-white)" stroke="var(--p-white)" stroke-width="2"/>
                            <text x="265" y="175" font-size="14" fill="var(--p-white)" font-weight="bold">D</text>
                            
                            <line x1="5" y1="92" x2="35" y2="92" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="5" y1="108" x2="35" y2="108" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="20" y1="40" x2="20" y2="92" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="20" y1="108" x2="20" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="40" x2="20" y2="40" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="160" x2="20" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="40" y="102" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₁</text>
                            
                            <line x1="285" y1="92" x2="315" y2="92" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="285" y1="108" x2="315" y2="108" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="300" y1="40" x2="300" y2="92" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="300" y1="108" x2="300" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="40" x2="300" y2="40" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="160" x2="300" y2="160" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="265" y="102" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₂</text>
                            
                            <line x1="147" y1="174" x2="147" y2="198" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="163" y1="174" x2="163" y2="198" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="60" y1="186" x2="147" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="147" y1="186" x2="147" y2="174" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="186" x2="163" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="163" y1="186" x2="163" y2="174" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="160" x2="60" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="160" x2="255" y2="186" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="172" y="168" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₃</text>
                            
                            <line x1="147" y1="2" x2="147" y2="26" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="163" y1="2" x2="163" y2="26" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="60" y1="14" x2="147" y2="14" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="147" y1="14" x2="147" y2="26" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="14" x2="163" y2="14" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="163" y1="14" x2="163" y2="26" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="60" y1="40" x2="60" y2="14" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="40" x2="255" y2="14" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="172" y="36" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₄</text>
                            
                            <line x1="110.5" y1="85.2" x2="122.9" y2="64.8" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="124.1" y1="93.6" x2="136.5" y2="73.2" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="60" y1="40" x2="116.7" y2="75" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="160" x2="130.3" y2="83.4" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="138" y="68" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₅</text>
                            
                            <line x1="178.5" y1="73.2" x2="190.9" y2="93.6" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="192.1" y1="64.8" x2="204.5" y2="85.2" stroke="var(--p-white)" stroke-width="2.5"/>
                            <line x1="60" y1="160" x2="184.7" y2="83.4" stroke="var(--p-white)" stroke-width="1.5"/>
                            <line x1="255" y1="40" x2="198.3" y2="75" stroke="var(--p-white)" stroke-width="1.5"/>
                            <text x="208" y="95" font-size="14" fill="var(--p-white)" font-style="italic" font-weight="bold">C₆</text>
                        </svg>
                        
                        <div class="advancedcoil-circuit-values">
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_1 = ${formatCapacitance(sixCapacitorModel.C1)}`" :fontsize="13" />
                            </div>
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_2 = ${formatCapacitance(sixCapacitorModel.C2)}`" :fontsize="13" />
                            </div>
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_3 = ${formatCapacitance(sixCapacitorModel.C3)}`" :fontsize="13" />
                            </div>
                        </div>
                        <div class="advancedcoil-circuit-values">
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_4 = ${formatCapacitance(sixCapacitorModel.C4)}`" :fontsize="13" />
                            </div>
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_5 = ${formatCapacitance(sixCapacitorModel.C5)}`" :fontsize="13" />
                            </div>
                            <div class="advancedcoil-circuit-value">
                                <vue-latex :expression="`C_6 = ${formatCapacitance(sixCapacitorModel.C6)}`" :fontsize="13" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.advancedcoil-wrapper {
    /* No top padding: align the parasitics cards with the normal MB config cards
       (same vertical start). The grid gap handles inter-card spacing. */
    padding: 0;
}

.advancedcoil-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    transition: opacity 0.3s ease;
}

@media (max-width: 1200px) {
    .advancedcoil-grid {
        grid-template-columns: 1fr;
    }
}

.advancedcoil-dimmed {
    opacity: 0.55;
}

.advancedcoil-card {
    background: linear-gradient(145deg, rgba(120, 120, 120, 0.05) 0%, rgba(120, 120, 120, 0.01) 100%);
    border: 1px solid rgba(120, 120, 120, 0.12);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(var(--p-black-rgb), 0.12), inset 0 1px 0 rgba(var(--p-white-rgb), 0.04);
}

.advancedcoil-card-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.75rem 1rem;
    background: rgba(120, 120, 120, 0.1);
    border-bottom: 1px solid rgba(120, 120, 120, 0.15);
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--p-primary);
    letter-spacing: 0.02em;
}

.advancedcoil-card-header i {
    font-size: 1rem;
    filter: drop-shadow(0 0 3px rgba(var(--p-black-rgb), 0.12));
}

.advancedcoil-card-body {
    padding: 0.75rem;
}

.advancedcoil-plot {
    min-height: 180px;
}

.advancedcoil-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 180px;
    color: rgba(var(--p-white-rgb), 0.45);
    font-size: 0.9rem;
    background: rgba(var(--p-black-rgb), 0.15);
    border-radius: 10px;
}

.advancedcoil-hint {
    text-align: center;
    font-size: 0.75rem;
    color: rgba(var(--p-white-rgb), 0.5);
    margin: 0.4rem 0 0.6rem;
}

.advancedcoil-freq {
    margin-bottom: 0.5rem;
}

.advancedcoil-matrix {
    text-align: center;
    margin-top: 0.75rem;
    padding: 0.5rem;
    background: rgba(var(--p-black-rgb), 0.18);
    border: 1px solid rgba(var(--p-white-rgb), 0.04);
    border-radius: 10px;
}

.advancedcoil-matrix-title {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(var(--p-white-rgb), 0.75);
    margin-bottom: 0.3rem;
}

.advancedcoil-matrix-subtitle {
    display: block;
    font-size: 0.75rem;
    color: rgba(var(--p-white-rgb), 0.5);
    margin-bottom: 0.3rem;
}

.advancedcoil-loading {
    color: rgba(var(--p-white-rgb), 0.55);
    font-size: 0.85rem;
}

.advancedcoil-empty {
    color: rgba(var(--p-white-rgb), 0.4);
    font-size: 0.8rem;
    font-style: italic;
}

.advancedcoil-error {
    color: var(--p-danger);
    font-size: 0.8rem;
    font-style: italic;
}

.advancedcoil-pairbox {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: rgba(var(--p-black-rgb), 0.22);
    border: 1px solid rgba(var(--p-white-rgb), 0.06);
    border-radius: 10px;
}

.advancedcoil-pairbox-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(var(--p-white-rgb), 0.9);
    margin-bottom: 0.5rem;
}

.advancedcoil-pairbox-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
}

.advancedcoil-pairbox-field label {
    display: block;
    font-size: 0.75rem;
    color: rgba(var(--p-white-rgb), 0.65);
    margin-bottom: 0.2rem;
}

.advancedcoil-pairbox-field select {
    width: 100%;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    background: rgba(var(--p-black-rgb), 0.35);
    color: var(--p-white);
    border: 1px solid rgba(var(--p-white-rgb), 0.12);
    border-radius: 6px;
    outline: none;
}

.advancedcoil-pairbox-empty {
    text-align: center;
    font-size: 0.8rem;
    color: rgba(var(--p-white-rgb), 0.5);
}

.advancedcoil-circuit {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: rgba(var(--p-black-rgb), 0.22);
    border: 1px solid rgba(var(--p-white-rgb), 0.06);
    border-radius: 10px;
}

.advancedcoil-circuit-header {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(var(--p-white-rgb), 0.9);
    margin-bottom: 0.2rem;
}

.advancedcoil-circuit-subtitle {
    font-size: 0.75rem;
    color: rgba(var(--p-white-rgb), 0.5);
    margin-bottom: 0.5rem;
}

.advancedcoil-circuit-svg {
    width: 100%;
    max-width: 280px;
    height: auto;
    display: block;
    margin: 0 auto;
}

.advancedcoil-circuit-values {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem 0.8rem;
    margin-top: 0.5rem;
    color: var(--p-white);
    font-size: 0.8rem;
}

.advancedcoil-circuit-value {
    background: rgba(var(--p-black-rgb), 0.25);
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
}
</style>
