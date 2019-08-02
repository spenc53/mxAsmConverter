Number.prototype.mod = function(n) {
    return ((this % n) + n) % n;
  };
  
  function print_state(state) {
    console.log("PC\t\t\t0x" + state.pc.toString(16));
    console.log("INC\t\t\t0x" + state.inc.toString(16));
    console.log("ACC\t\t\t0x" + state.acc.toString(16));
    memory = [];
    for (i = 0; i < 16; ++i) { memory[i] = "0x" + state.registers[i].toString(16); }
    console.log("MEMORY\t\t\t" + memory.join(","));
  }
  
  function interpret(program, state) {
    bytes = program.split(/\s+/);
  
    console.log("Running program");
    while (true) {
      state.cycles++;
      if (state.cycles == 1000) throw "Program terminated because it ran too long.  Do you have an infinite loop in your program?";
  
      operation  = parseInt(bytes[state.pc], 16) % 256;
      operand    = parseInt(bytes[state.pc + 1], 16) % 256;
      operand2   = parseInt(bytes[state.pc + 2], 16) % 256;
  
      switch (operation) {
        // Jumps / Branch
        case 0xB1:
          state.pc = operand;
          state.pc = state.pc % 256;
          break;
        case 0xB2:
          if (state.registers[operand % 16] == state.acc)
            state.pc = operand2;
          else
            state.pc += 3;
          state.pc = state.pc % 256;
          break;
        case 0xB3:
          if (state.acc == operand) {
            state.pc = operand2;
          } else {
            state.pc += 3;
          }
          state.pc = state.pc % 256;
          break;
        // Accumulator
        case 0xC0:
          state.acc += state.registers[operand % 16];
          state.pc += 2;
          state.acc = state.acc % 256;
          state.pc = state.pc % 256;
          break;
        case 0xC1:
          state.acc += operand;
          state.pc += 2;
          state.acc = state.acc % 256;
          state.pc = state.pc % 256;
          break;
        // Counter
        case 0xC2:
          state.inc++;
          state.pc++;
          state.inc = state.inc % 256;
          state.pc = state.pc % 256;
          break;
        case 0xC3:
          state.inc--;
          state.pc++;
          state.inc = state.inc.mod(256);
          state.pc = state.pc % 256;
          break;
        case 0xC4:
          state.inc = 0;
          state.pc++;
          state.pc = state.pc % 256;
          break;
        case 0xC5:
          state.acc = state.inc;
          state.pc++;
          state.acc = state.acc % 256;
          state.pc = state.pc % 256;
          break;
        case 0xC6:
          state.inc = state.acc;
          state.pc++;
          state.inc = state.inc % 256;
          state.pc = state.pc % 256;
          break;
        // Load / Store
        case 0xD0:
          state.acc = state.registers[operand % 16];
          state.pc += 2;
          state.acc = state.acc % 256;
          state.pc = state.pc % 256;
          break;
        case 0xD1:
          state.acc = operand;
          state.pc += 2;
          state.acc = state.acc % 256;
          state.pc = state.pc % 256;
          break;
        case 0xD2:
          state.registers[operand % 16] = state.acc;
          state.pc += 2;
          state.pc = state.pc % 256;
          break;
        case 0x00:
          console.log("Terminating");
          return;
        default:
          throw "Illegal op code `0x" + operation.toString(16) + "' at address `0x" + state.pc.toString(16) + "'";
      }
    }
  }
  
  state = {
    cycles: 0,
    inc: 0,
    pc: 0,
    acc: 0,
    registers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7] 
  };
  
  interpret("D2 00 D1 00 D2 0E D0 00 D2 00 D1 01 D2 0D D0 00 D2 00 D1 00 D2 0C D0 00 D2 00 D1 00 D2 0B D0 00 D0 0F D2 0A D0 0B B2 0A 47 D1 01 D2 09 D0 0B C0 09 D2 0B D0 0D D2 09 D0 0E C0 09 D2 0C D0 0D D2 0E D0 0C D2 0D B1 24 D0 0E D2 00 00"
  , state);
  
  print_state(state);