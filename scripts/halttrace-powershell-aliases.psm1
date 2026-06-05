function halttrace:latest {
  halttrace latest @args
}

function halttrace:explain {
  halttrace explain @args
}

function halttrace:handoff {
  halttrace handoff @args
}

function halttrace:doctor {
  halttrace doctor @args
}

Export-ModuleMember -Function 'halttrace:latest', 'halttrace:explain', 'halttrace:handoff', 'halttrace:doctor'
