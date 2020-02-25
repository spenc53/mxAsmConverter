let acorn = require("acorn");

// BYTE COMMANDS / Pointer commands
SET_PC_TO_BYTE = "B1";
JMP_IF_ACC_EQ_MEM = "B2";
JMP_IF_ACC_EQ_LITERAL = "B3";

// COUNTER COMMANDS
ADD_LITERAL_TO_COUNTER = "C1";
INC_COUNTER = "C2";
DEC_COUNTER = "C3";
RESET_COUNTER = "C4";
MOVE_COUNTER_TO_ACC = "C5";
MOVE_ACC_TO_COUNTER = "C6";

// ACCUMULATOR FUNCTIONS
ADD_MEM_TO_ACC = "C0"; // this is a weird command
MOVE_MEM_TO_ACC = "D0";
SET_ACC_TO_LITERAL = "D1";
MOVE_ACC_TO_MEM = "D2";

// END
STOP = "00";

MAX_MEMORY = 16;

//get program
function convertToAssembly(str) {
    let ast = acorn.parse(str);
    body = ast["body"][0]
    paramList = body["params"]
    paramMap = {}
    memoryLocation = MAX_MEMORY - 1; // last location in memory
    for (var param of paramList) {
        paramMap[param.name] = memoryLocation;
        memoryLocation--;
    }
    env = {}
    env['params'] = paramMap;
    env['memLocation'] = memoryLocation;
    env['commands'] = [];
    env['pc'] = 0
    funcBody = body["body"]
    
    output = parse(funcBody, env);
    console.log(output.join(" "))
}

function parse(ast, env) {
    var type = ast["type"]
    switch (type) {
        case "VariableDeclaration":
            return variableDeclaration(ast, env);
        case "VariableDeclarator":
            return variableDeclarator(ast, env);
        case "ReturnStatement":
            return returnStatement(ast, env);
        case "BinaryExpression":
            if (ast.operator == "+") {
                return addStatement(ast, env);
            } else if(ast.operator == "!=") {
                return notEquals(ast, env)
            }
            throw Error('Operator "' + ast.operator + '" not suppored')
        case "BlockStatement":
            return blockStatement(ast, env);
        case "ExpressionStatement":
            return expressionStatement(ast, env);
        case "AssignmentExpression":
            return assignmentStatement(ast, env);
        case "ForStatement":
            return forStatement(ast, env);
        case "Literal":
        case "LiteralExpression":
            return [SET_ACC_TO_LITERAL, numToHex(ast.raw)];
        case "Identifier":
            return [MOVE_MEM_TO_ACC, numToHex(env.params[ast.name])];
        default:
            throw Error(type + " is not supported");
    }
}

function expressionStatement(ast, env) {
    var command = parse(ast.expression, env);
    return command;
}

function blockStatement(ast, env) {
    var blockCommands = []
    for (statement of ast.body) {
        command = parse(statement, env);
        blockCommands = blockCommands.concat(command);
        env.commands = blockCommands;
    }
    return blockCommands;
}

function returnStatement(ast, env) {
    var command = parse(ast.argument, env);
    return command.concat([
        MOVE_ACC_TO_MEM, "00",  // MOVE ACC TO RETURN
        STOP                    // stop exec
    ]);
}

function assignmentStatement(ast, env) {
    var commands = []
    if (!env.params[ast.left.name]) {
        throw Error('Variable "' + ast.left.name + '" was not declared before use');
    }
    var leftVar = env.params[ast.left.name];

    var rightCommands = parse(ast.right, env);
    
    return commands.concat(rightCommands.concat([MOVE_ACC_TO_MEM, numToHex(leftVar)]));
}

function variableDeclaration(ast, env) {
    var commands = []
    for (var decoration of ast.declarations) {
        commands = commands.concat(parse(decoration, env));
    }
    return commands;
}

function variableDeclarator(ast, env) {
    var variableName = ast.id.name;
    if (env.params[variableName]) {
        throw Error('variable "' + variableName + '" is already declared in this');
    }

    env.params[variableName] = env.memLocation;
    env.memLocation--;
    ast.raw = 0;
    if (ast.init) {
        ast.raw = ast.init.value;
    }
    return saveLiteral(ast, numToHex(env.params[variableName]), env)
}

// TODO: add support for i++
// write optimizer that changes i++ to i = i + 1; this way i don't have to write edge cases
function forStatement(ast, env) {
    newParams = {}
    for (var elem in env.params) {
        newParams[elem] = env.params[elem];
    }


    newEnv = {
        "params": newParams,
        "memLocation": env.memLocation,
        "commands": []
    }

    var initCommands = parse(ast.init, newEnv);
    var testCommands = parse(ast.test, newEnv);
    var updateCommand = parse(ast.update, newEnv);


    // need the memory location of the for loop
    var startForLoopLoc = env.pc + env.commands.concat(initCommands).concat(testCommands).length - 8; // subtract 4, (2) for moving, (2) for the check w/o the other jmp yet
    var jmpToStart = [SET_PC_TO_BYTE, numToHex(startForLoopLoc)];
    
    newEnv['pc'] = env.pc + env.commands.concat(initCommands).concat(testCommands).concat(updateCommand).length + 1; 

    var bodyCommmands = parse(ast.body, newEnv);

    // find the end of the for loop
    var currPointer = env.pc + env.commands.concat(initCommands).concat(updateCommand).concat(testCommands).concat(bodyCommmands).concat(jmpToStart).length + 1; // add 1 so we out of the for loop

    // finish the test command with where to jump if equals
    var testCommands = testCommands.concat([numToHex(currPointer)]);

    return [].concat(initCommands).concat(testCommands).concat(updateCommand).concat(bodyCommmands).concat(jmpToStart);
}

function addStatement(ast, env) {
    var memLocation = env.memLocation;
    env.memLocation--;
    var rightCommands = parse(ast.right, env);
    var leftCommands = parse(ast.left, env);
    var commands = rightCommands.concat([MOVE_ACC_TO_MEM, numToHex(memLocation)]);
    commands = commands.concat(leftCommands);
    commands = commands.concat(ADD_MEM_TO_ACC, numToHex(memLocation));
    env.memLocation++;
    return commands;
}

function notEquals(ast, env) {
    var memLocation = env.memLocation;
    env.memLocation--;
    var leftCommands = parse(ast.left, env);
    var rightCommands = parse(ast.right, env);
    rightCommands = rightCommands.concat([MOVE_ACC_TO_MEM, numToHex(memLocation)]);
    var commands = [].concat(rightCommands);
    commands = commands.concat(leftCommands)
    commands = commands.concat([JMP_IF_ACC_EQ_MEM, numToHex(memLocation)]);
    env.memLocation++;
    return commands;
}

function saveLiteral(ast, memLoc, env) {
    var commands = [ 
        MOVE_ACC_TO_MEM, numToHex(env.memLocation),                          // save acc in 00
        SET_ACC_TO_LITERAL, numToHex(ast.raw),          // save literal to acc
        MOVE_ACC_TO_MEM, numToHex(memLoc),              // move literal to memory
        MOVE_MEM_TO_ACC, numToHex(env.memLocation)                           // move original acc back
        ];
    return commands;
}

function numToHex(num) {
    var hex = num.toString(16).toUpperCase();
    if (hex.length == 1) {
        return "0" + hex
    }
    return hex;
}



fib = `function fib(n) {
    var prev = 0
    var curr = 1
    var next
    for (var i = 0; i != n; i = i + 1) {
        next = prev + curr
        prev = curr
        curr = next
    }
    return prev
}`

sum = `function sum(a, b) {
    return a + b
}`

asdf = `
function asdf() {
    var a = 1
    var b = 2
    return a + b
}
`

thing = `
function thing(n) {
    var c = 0
    for (var i = 0; i != n; i = i + 1) {
        for (var j = 0; j != n; j = j + 1) {
            c = c + 1
        }
    }
    return c
}
`

simpleFor = `
function thing(n) {
    var c = 0
    for (var i = 0; i != n; i = i + 1) {
        c = c + 1
    }
    return c
}
`

testIf = `
function test() {
    var c = 1;
    if (c == 1) {
        return 1
    }
    return 0
}
`

convertToAssembly(testIf);

/*
0: D2 0D D1 00 D2 0E D0 0D // init c to 0
8: D2 0C D1 00 D2 0D D0 0C // init i to 0
16: D0 0F D2 0C D0 0D B2 0C 2F //move n to 0C and then move i to acc and check
D1 01 D2 0C // set mem  slot to 1
D0 0D C0 0C D2 0D // increment i
D1 01 D2 0C D0 0E C0 0C D2 0E // increment C
B1 14 // jump to line HEX 14 == 16 + 4 = 20
D0 0E D2 00 // move c to 00
00 // return
*/
