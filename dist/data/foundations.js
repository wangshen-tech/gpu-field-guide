window.GPU_FOUNDATIONS = [
  {
    id: 'compute-model', title: 'Think in throughput, latency, and bottlenecks', group: 'Foundations', level: 'Beginner', minutes: 35,
    summary: 'Build the performance model that explains when one GPU helps—and when data movement, serial work, or launch overhead wins.',
    tags: ['CPU vs GPU', 'Throughput', 'Amdahl', 'Arithmetic intensity'],
    objectives: ['Separate latency, throughput, and utilization in an experiment.', 'Estimate a compute or memory lower bound using units.', 'Explain why a faster kernel may barely improve a service.'],
    sections: [
      {heading: 'A heterogeneous machine', body: 'A CPU handles orchestration, operating-system work, and control-heavy code. A GPU offers many parallel execution resources for large collections of similar operations. Both processors support parallelism; their tradeoffs differ. A single request still passes through storage, host memory, CPU preparation, transfers, device computation, and response handling. Draw this entire path before deciding which stage deserves an optimization.'},
      {heading: 'Three different questions', body: 'Latency asks how long one unit of work takes. Throughput asks how many units finish per second. Utilization describes some observed fraction of resource activity; its meaning depends on the metric. A larger batch can raise samples per second while increasing request waiting time. A busy GPU can still execute an inefficient kernel. Report workload size, latency percentiles, and useful work per second together.'},
      {heading: 'Count work and movement', body: 'A dense M-by-K times K-by-N matrix multiply performs approximately 2MKN floating-point operations when a multiply and add count separately. Arithmetic intensity is operations divided by bytes transferred at a stated memory boundary. Use a simple lower bound: time is at least the larger of compute work divided by applicable compute throughput and transferred bytes divided by applicable bandwidth. Cache reuse changes the byte count.'},
      {heading: 'Why small workloads disappoint', body: 'Submitting device work, arranging inputs, and waiting for results have costs. For tiny arrays, these costs can dominate useful arithmetic. Keeping intermediate tensors on the device avoids repeated host transfers. Batching and fusing operations can amortize overhead, but only within latency and memory limits. Predict a crossover as problem size grows, then measure it; there is no universal array size at which every GPU wins.'},
      {heading: 'End-to-end speedup has a ceiling', body: 'Suppose GPU computation consumes 40% of an application and everything else consumes 60%. Making the GPU portion twice as fast changes normalized time to 0.6 + 0.4/2 = 0.8, a 1.25x speedup. Even infinitely fast GPU work cannot exceed 1/0.6 here. Use this calculation to prioritize input loading or serialization when kernel tuning has little remaining business value.'},
      {heading: 'Checkpoint: explain a surprising result', body: 'Before benchmarking, warm up the runtime and libraries, control the input shape and dtype, and synchronize at meaningful timing boundaries. Separate device-only timing from transfers and complete-request timing. Repeat measurements and record software and hardware. Your checkpoint is a short explanation of why a GPU may lose a small operation yet win a large batch. Avoid comparing a cold GPU run with a warmed CPU run.'}
    ],
    lab: {title: 'Find the shape-dependent crossover', steps: ['Use a Linux machine with a working CUDA-enabled PyTorch installation and one NVIDIA GPU; this example does not install software.', 'Run the script for several small matrix sizes. It uses synchronized wall time and excludes allocation and transfers.', 'Record the CPU thread count, GPU model, and median milliseconds. Then add explicit transfers to a separate experiment.', 'Explain whether launch overhead, math throughput, or data movement is the likely limit; these results are observations, not a hardware ranking.'], code: `import time, statistics, torch
assert torch.cuda.is_available(), "This lab requires an NVIDIA CUDA GPU"
print(torch.cuda.get_device_name(0), "CPU threads:", torch.get_num_threads())
for n in (64, 256, 1024):
    a = torch.randn(n, n)
    for device in ("cpu", "cuda"):
        x = a.to(device)
        for _ in range(5):
            y = x @ x
        if device == "cuda": torch.cuda.synchronize()
        times = []
        for _ in range(9):
            start = time.perf_counter()
            y = x @ x
            if device == "cuda": torch.cuda.synchronize()
            times.append((time.perf_counter() - start) * 1000)
        print(n, device, "median ms", round(statistics.median(times), 4))`, success: 'Produce a table with three shapes and both devices, plus a clear statement of what the timing includes. No specific speedup is required.'},
    quiz: {question: 'A GPU kernel takes 20% of total request time. What is the largest possible end-to-end speedup if that kernel becomes infinitely fast?', choices: ['5x', '1.25x', '2x', 'Unlimited'], answer: 1, explanation: 'The remaining 80% still takes time. Amdahl’s limit is 1 / 0.8 = 1.25x.'},
    sources: [{label: 'NVIDIA: CUDA Best Practices Guide', url: 'https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html'}, {label: 'NVIDIA: CUDA FAQ', url: 'https://developer.nvidia.com/cuda/faq'}, {label: 'PyTorch: CUDA semantics and timing', url: 'https://docs.pytorch.org/docs/stable/notes/cuda.html'}]
  },
  {
    id: 'gpu-architecture', title: 'Read a GPU from SMs to Tensor Cores', group: 'Foundations', level: 'Beginner', minutes: 45,
    summary: 'Connect logical CUDA work to physical execution without confusing a software thread, a CUDA core, and an entire GPU.',
    tags: ['SM', 'Warp', 'SIMT', 'Tensor Cores', 'Occupancy'],
    objectives: ['Describe how blocks and warps map onto streaming multiprocessors.', 'Explain occupancy as a constraint and diagnostic rather than a score.', 'Qualify architecture claims using compute capability and a tuning guide.'],
    sections: [
      {heading: 'Start with a hardware inventory', body: 'An NVIDIA GPU contains streaming multiprocessors, memory controllers, caches, and engines for tasks such as copying data. An SM contains scheduling and execution resources, registers, and shared memory. Exact quantities vary by model and generation. Compute capability identifies an architectural feature set; it is distinct from a marketing name, driver version, or CUDA Toolkit version. Record all of these separately when comparing behavior.'},
      {heading: 'Threads become warps', body: 'CUDA exposes individual threads, but NVIDIA hardware schedules their instructions in groups called warps, currently 32 threads. A thread is a logical execution context, not a permanently assigned physical arithmetic unit. Blocks are assigned to SMs, where their warps compete for execution resources. A kernel can launch many more threads than can be resident at once; remaining blocks wait for capacity.'},
      {heading: 'Hide latency with ready work', body: 'When one warp waits for a dependency, a scheduler can issue instructions from another eligible warp. Resident warps are therefore useful for hiding latency, but residency alone does not ensure readiness. Long dependency chains, insufficient independent work, memory pressure, and limited instruction throughput can still stall progress. Think of a queue of workers with prerequisites, rather than assuming every resident thread computes during every clock cycle.'},
      {heading: 'Divergence and synchronization', body: 'If threads in a warp take different branches, execution may require different active masks for different paths. The cost depends on the generated code and workload. Independent thread scheduling on newer architectures does not make unsynchronized communication correct. Use documented warp or block synchronization primitives and valid participation masks. A branch where every thread makes the same decision is different from a randomly mixed branch.'},
      {heading: 'Tensor Cores are specialized execution', body: 'Tensor Cores accelerate supported matrix operations, using architecture-dependent shapes, formats, and accumulation modes. They do not automatically accelerate every floating-point instruction. Libraries choose kernels based on dimensions, layout, dtype, and available hardware. A peak Tensor Core number cannot be compared directly with ordinary FP32 arithmetic throughput without explaining the math mode. Newer features must be checked against the device’s compute capability and software support.'},
      {heading: 'Checkpoint: occupancy is a tradeoff', body: 'Occupancy compares active resident warps with the architectural maximum. Register allocation, shared memory per block, threads per block, and block limits can constrain it. Increasing occupancy may help latency hiding, but reducing registers can introduce costly spills. Your checkpoint is to explain why a kernel at lower occupancy can outperform one at higher occupancy. Use measured runtime and profiler evidence to choose, rather than optimizing the percentage alone.'}
    ],
    lab: {title: 'Build a device capability card', steps: ['Run this read-only inventory on a CUDA-enabled PyTorch environment.', 'Look up the reported compute capability in NVIDIA’s architecture documentation.', 'Add one supported feature and one architecture-specific limit to your notes; avoid copying numbers from another GPU generation.', 'Explain the difference between SM count, warp size, and the total number of threads a kernel can launch.'], code: `import torch
assert torch.cuda.is_available(), "This lab requires a CUDA GPU"
p = torch.cuda.get_device_properties(0)
print("Name:", p.name)
print("Compute capability:", torch.cuda.get_device_capability(0))
print("SM count:", p.multi_processor_count)
print("Device memory GiB:", round(p.total_memory / 2**30, 2))
print("Framework CUDA build:", torch.version.cuda)
print("PyTorch:", torch.__version__)
print("BF16 available:", torch.cuda.is_bf16_supported())`, success: 'Create a capability card with values from your own device and one official architecture reference. Do not infer Tensor Core throughput from SM count alone.'},
    quiz: {question: 'Why can reducing register use to increase occupancy make a kernel slower?', choices: ['More occupancy always lowers the clock', 'Registers are only used by CPUs', 'Register spills can add memory traffic', 'Warps stop executing in parallel'], answer: 2, explanation: 'Reducing the register budget may move values to local memory backed by device memory. The extra traffic and instructions can outweigh increased residency.'},
    sources: [{label: 'NVIDIA: CUDA platform and compute capability', url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html'}, {label: 'NVIDIA: PTX execution and memory model', url: 'https://docs.nvidia.com/cuda/parallel-thread-execution/index.html'}, {label: 'NVIDIA: Ampere tuning guide (architecture example)', url: 'https://docs.nvidia.com/cuda/ampere-tuning-guide/index.html'}]
  },
  {
    id: 'memory-hierarchy', title: 'Follow every byte through the memory hierarchy', group: 'Foundations', level: 'Intermediate', minutes: 50,
    summary: 'Understand capacity, locality, coalescing, shared memory, and the difference between a convenient address space and free data movement.',
    tags: ['HBM', 'GDDR', 'Registers', 'Shared memory', 'Coalescing'],
    objectives: ['Identify where a tensor and a kernel’s temporary values live.', 'Explain coalescing and reuse as two separate optimizations.', 'Distinguish device capacity, bandwidth, and host-transfer constraints.'],
    sections: [
      {heading: 'Capacity is not bandwidth', body: 'GPU device memory holds tensors, parameters, activations, and workspaces. Data-center accelerators often use HBM; other GPUs may use GDDR. Capacity determines what fits, while bandwidth limits how quickly bytes can move. Two devices with similar capacity can have very different bandwidth. A model that fits comfortably can still be memory-bound because each operation does little arithmetic for every byte it reads.'},
      {heading: 'Registers, shared memory, and caches', body: 'Registers hold thread-local working values. Shared memory lets threads in a block explicitly reuse data and coordinate algorithms. L1 and L2 caches reduce some repeated accesses without requiring explicit staging. These resources are limited and interact with occupancy. Local memory is a CUDA address space for thread-private data, not a promise of on-chip storage; spilled registers and some arrays can generate device-memory traffic.'},
      {heading: 'Coalescing makes neighboring work cooperate', body: 'For a memory instruction, addresses requested by active threads in a warp determine the memory transactions required. Nearby, suitably aligned addresses typically use the memory system efficiently. A large stride can fetch many sectors containing little useful data. Coalescing concerns access patterns across threads; reuse concerns using the same loaded value repeatedly. A kernel can improve one while still being poor at the other.'},
      {heading: 'Tiling trades storage for reuse', body: 'A matrix-multiplication tile loads a portion of its inputs and reuses those values across multiple multiply-adds. Shared memory and registers can support that reuse. Larger tiles may reduce traffic but consume more resources, reduce residency, or complicate edge handling. Shared-memory bank conflicts can serialize some accesses. Treat tile size and layout as measured choices tied to an architecture and workload, rather than magic constants.'},
      {heading: 'Host memory remains a separate concern', body: 'On a typical discrete-GPU Linux machine, host-to-device transfers cross a link with its own latency and bandwidth. Pinned host memory enables transfer patterns that pageable memory cannot guarantee. Unified virtual addressing provides a unified pointer space; it does not make all memory equally fast. Managed-memory placement, migration, coherency, and oversubscription behavior depend on the platform. Inspect the actual configuration before making locality assumptions.'},
      {heading: 'Checkpoint: account for live bytes', body: 'Estimate a dense tensor’s payload as element count times bytes per element, then add simultaneous tensors, gradients, optimizer states, temporary workspaces, and allocator overhead. Distinguish a capacity failure from excessive transfer time. Your checkpoint is to sketch the lifetime of three tensors and calculate peak live storage. Avoid summing every tensor ever created: peak memory depends on which allocations coexist, and views can share storage.'}
    ],
    lab: {title: 'Inspect strides and materialization', steps: ['Run the example with CUDA PyTorch; it allocates only a small tensor.', 'Compare shape, stride, contiguity, and data pointers after transpose and contiguous conversion.', 'Predict which operation moves payload bytes before running it.', 'Extend the example to a larger tensor only after estimating memory. Profiling a specific kernel is required before claiming a performance advantage.'], code: `import torch
assert torch.cuda.is_available(), "This lab requires a CUDA GPU"
x = torch.arange(24, device="cuda").reshape(4, 6)
t = x.t()
c = t.contiguous()
for name, value in (("original", x), ("transpose", t), ("copy", c)):
    print(name, "shape", tuple(value.shape), "stride", value.stride(),
          "contiguous", value.is_contiguous(), "data_ptr", value.data_ptr())
print("Payload bytes:", x.numel() * x.element_size())
assert x.data_ptr() == t.data_ptr()
assert c.data_ptr() != t.data_ptr()
assert torch.equal(c, t)`, success: 'Explain why transpose can be cheap to create yet affect downstream access, and why a contiguous copy requires additional storage while both tensors are alive.'},
    quiz: {question: 'Which statement about coalescing is correct?', choices: ['It guarantees that a kernel is compute-bound', 'It combines efficient nearby warp accesses into fewer memory transactions', 'It means all tensors fit in shared memory', 'It removes host-to-device transfers'], answer: 1, explanation: 'Coalescing concerns the addresses accessed by threads for a memory instruction. It does not guarantee reuse, sufficient arithmetic intensity, or zero transfers.'},
    sources: [{label: 'NVIDIA: Memory optimization and coalescing', url: 'https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html#memory-optimizations'}, {label: 'NVIDIA: Unified and system memory', url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/understanding-memory.html'}, {label: 'PyTorch: Tensor views', url: 'https://docs.pytorch.org/docs/stable/tensor_view.html'}]
  },
  {
    id: 'cuda-model', title: 'Make parallel and asynchronous execution correct', group: 'Foundations', level: 'Intermediate', minutes: 55,
    summary: 'Map work into grids and blocks, reason about synchronization scope, and use streams and events without introducing races.',
    tags: ['Grid', 'Block', 'Synchronization', 'Streams', 'Events'],
    objectives: ['Map an element index to block and thread coordinates.', 'Choose synchronization with the correct scope.', 'Create an explicit cross-stream dependency and measure completed work.'],
    sections: [
      {heading: 'A launch describes a grid', body: 'A CUDA kernel launch creates a grid of thread blocks. Each block contains threads with local indices; combining block and thread coordinates gives a global work index. A one-dimensional elementwise kernel often uses i = blockIdx.x * blockDim.x + threadIdx.x, followed by an i < n bounds check. Grid-stride loops let each thread process additional elements when the grid is smaller than the data.'},
      {heading: 'Cooperation needs the right scope', body: 'Threads in a block can share data through shared memory and synchronize with block barriers. All participating threads must follow the documented barrier rules; placing a block barrier in a condition taken by only some threads can be invalid. Blocks are generally independent and may run in any order. An ordinary kernel cannot assume all blocks are resident or use a block barrier as a grid-wide barrier.'},
      {heading: 'Asynchronous means submission is not completion', body: 'A host kernel launch usually returns before device work finishes. Host code may continue while the device executes queued operations. Reading a CPU timer immediately after a launch therefore measures submission overhead rather than complete computation. Some APIs and dependencies cause synchronization, so do not assume every call overlaps. Check launch errors promptly and use a synchronization point when collecting completion status during debugging.'},
      {heading: 'Streams express order', body: 'Operations in one stream execute in order. Work in different streams may overlap when dependencies and hardware resources allow it; overlap is never guaranteed merely by creating streams. Express producer-consumer relationships with events or stream waits. Default-stream behavior depends on the selected semantics and surrounding APIs. A correct program specifies required dependencies instead of relying on an accidental scheduling order observed on one run.'},
      {heading: 'Memory lifetime is also a dependency', body: 'An asynchronous copy must not outlive valid source and destination storage. Cross-stream tensor use also interacts with allocator reuse. In PyTorch, stream waits order work, while record_stream can inform the allocator about a tensor’s use on another stream. Keeping buffers alive until completion is a simpler teaching pattern. Pinned memory can enable asynchronous transfers, but immediately mutating a still-in-use host buffer remains incorrect.'},
      {heading: 'Checkpoint: draw a timeline', body: 'Draw host submission, two stream queues, a producer event, and the consumer wait. Mark exactly when the host can inspect the result and when buffers may be reused. Your checkpoint is to remove an unnecessary device-wide synchronization while preserving the dependency. For measurements, CUDA events capture time on a device stream; synchronized wall time captures a broader boundary. Neither automatically measures full service latency.'}
    ],
    lab: {title: 'Order a producer and consumer across streams', steps: ['Use CUDA-enabled PyTorch on a single NVIDIA GPU.', 'Read the waits and event before running; predict which stream owns each operation.', 'Keep all tensors alive through the final synchronization as this example does.', 'Verify the result, then explain why deleting the producer event wait would create a race rather than a valid optimization.'], code: `import torch
assert torch.cuda.is_available(), "This lab requires a CUDA GPU"
producer = torch.cuda.Stream()
consumer = torch.cuda.Stream()
ready = torch.cuda.Event()
x = torch.zeros(1024, device="cuda")
producer.wait_stream(torch.cuda.current_stream())
with torch.cuda.stream(producer):
    x.fill_(3)
    ready.record()
with torch.cuda.stream(consumer):
    consumer.wait_event(ready)
    y = x * 2
consumer.synchronize()
assert torch.equal(y, torch.full_like(y, 6))
print("Consumer observed every producer write.")`, success: 'The assertion passes, and you can distinguish ordering, host completion, and allocation lifetime. The example demonstrates correctness, not guaranteed overlap.'},
    quiz: {question: 'A kernel in stream B needs values written by stream A. What is an appropriate dependency?', choices: ['Assume A launched first, so it finishes first', 'Increase B’s block size', 'Record an event after A’s work and make B wait for it', 'Call a block barrier inside B'], answer: 2, explanation: 'An event wait creates an explicit cross-stream dependency. Submission order across independent streams is not a sufficient guarantee, and a block barrier has the wrong scope.'},
    sources: [{label: 'NVIDIA: Intro to CUDA C++', url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/intro-to-cuda-cpp.html'}, {label: 'NVIDIA: Asynchronous execution', url: 'https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/asynchronous-execution.html'}, {label: 'PyTorch: CUDA stream semantics', url: 'https://docs.pytorch.org/docs/stable/notes/cuda.html#cuda-streams'}]
  },
  {
    id: 'numerical-precision', title: 'Choose precision with an error budget', group: 'Foundations', level: 'Intermediate', minutes: 45,
    summary: 'Treat FP32, FP16, BF16, TF32, and quantization as accuracy and systems choices, not interchangeable speed switches.',
    tags: ['FP16', 'BF16', 'TF32', 'AMP', 'Quantization'],
    objectives: ['Separate numeric range, precision, storage type, and accumulation type.', 'Explain mixed precision and gradient scaling.', 'Validate a lower-precision path against explicit numerical and model-quality criteria.'],
    sections: [
      {heading: 'Range and precision solve different problems', body: 'Floating-point formats divide bits among sign, exponent, and significand. Exponent range determines the scale of representable values; significand precision controls spacing near a value. FP16 has more significand bits than BF16 but a narrower exponent range. BF16 has the exponent width of FP32 but fewer significand bits. Neither format is universally more accurate: the distribution and arithmetic matter.'},
      {heading: 'Storage is not the whole operation', body: 'An operator can load one dtype, perform products in a particular math mode, accumulate in another format, and store a lower-precision result. TF32 is a Tensor Core computation mode for eligible FP32 operations on supported NVIDIA architectures, not a general replacement tensor storage dtype. Backend controls and defaults can change across framework releases. Record explicit settings when comparing performance or debugging a numerical regression.'},
      {heading: 'Mixed precision is selective', body: 'Automatic mixed precision chooses eligible operation dtypes, keeping some operations in higher precision. FP16 training often uses gradient scaling to protect small gradients from underflow. Scaling does not repair every source of overflow, instability, or invalid input. BF16’s wider range often avoids the need for scaling, but it still requires validation. Do not cast an entire training program blindly and assume every reduction remains stable.'},
      {heading: 'Quantization changes representation', body: 'Integer quantization maps values to a finite set using parameters such as scale and zero point; symmetric schemes may use zero point zero. Per-channel or grouped scales can preserve information better for some weight distributions, at a metadata and implementation cost. Weight-only quantization differs from quantizing activations. Lower bit width reduces nominal storage, but packing, dequantization, supported kernels, and workload shape determine actual speed.'},
      {heading: 'Numerical tests need context', body: 'Floating-point addition is not associative. Parallel reductions and alternative kernels may produce different results even with the same nominal dtype. Compare absolute and relative error, check finite values, and evaluate downstream model quality on representative inputs. Relative error becomes misleading near zero, so use a combined tolerance. A single random tensor test is useful for diagnosis but cannot establish a model’s production quality.'},
      {heading: 'Checkpoint: define acceptance before tuning', body: 'Write a decision record with baseline precision, proposed storage and compute modes, representative shapes, accuracy tolerance, model-quality metric, memory target, and latency target. Then change one configuration at a time. Your checkpoint is explaining why casting the number 100000 to FP16 can overflow while BF16 can represent its scale approximately. Avoid accepting a faster path merely because its outputs have the correct shape.'}
    ],
    lab: {title: 'Observe range, rounding, and simple quantization', steps: ['This small PyTorch exercise runs on CPU, so it does not require a GPU.', 'Predict which cast overflows and which loses more detail around one.', 'Inspect the reconstruction error from a symmetric INT8 teaching example.', 'Treat the quantization code as a representation demonstration; it does not create an optimized inference kernel.'], code: `import torch
values = torch.tensor([1.0, 1.001, 65504.0, 100000.0])
for dtype in (torch.float32, torch.float16, torch.bfloat16):
    restored = values.to(dtype).float()
    print(dtype, restored.tolist(), "finite:", torch.isfinite(restored).tolist())
w = torch.tensor([-2.0, -0.3, 0.0, 0.7, 1.9])
scale = w.abs().max() / 127
q = torch.clamp(torch.round(w / scale), -127, 127).to(torch.int8)
reconstructed = q.float() * scale
print("int8 codes:", q.tolist())
print("scale:", scale.item())
print("max absolute error:", (w - reconstructed).abs().max().item())`, success: 'Explain both overflow and rounding in the output, and state why INT8 storage savings alone do not prove an inference speedup.'},
    quiz: {question: 'Which statement best describes BF16 compared with FP16?', choices: ['BF16 has a wider exponent range but fewer significand bits', 'BF16 always has smaller error', 'BF16 is a form of INT8 quantization', 'BF16 guarantees no overflow in every computation'], answer: 0, explanation: 'BF16 trades significand precision for exponent range. It can still round aggressively, overflow in sufficiently large computations, or propagate NaNs.'},
    sources: [{label: 'PyTorch: Numerical accuracy', url: 'https://docs.pytorch.org/docs/stable/notes/numerical_accuracy.html'}, {label: 'PyTorch: Automatic mixed precision', url: 'https://docs.pytorch.org/docs/stable/amp.html'}, {label: 'NVIDIA: Tensor Core formats in Ampere', url: 'https://docs.nvidia.com/cuda/ampere-tuning-guide/index.html#improved-tensor-core-operations'}]
  },
  {
    id: 'software-stack', title: 'Untangle the driver, toolkit, runtime, and container', group: 'Foundations', level: 'Beginner', minutes: 40,
    summary: 'Diagnose the layer that failed and record a reproducible environment without treating every CUDA version string as the same thing.',
    tags: ['Driver', 'CUDA Toolkit', 'Compatibility', 'Containers', 'Reproducibility'],
    objectives: ['Distinguish the host driver, compiler toolkit, and application runtime.', 'Explain why a GPU container still depends on the host.', 'Collect a minimal environment report before making changes.'],
    sections: [
      {heading: 'The stack has separate layers', body: 'The host NVIDIA driver enables applications to use the device. The CUDA Toolkit supplies development tools, headers, libraries, and nvcc. Applications use a runtime and may bring CUDA libraries through their installation packages. A framework binary can execute without a locally installed nvcc, while building a custom CUDA extension may require an appropriate toolkit and host compiler. Start diagnosis by identifying the failing layer.'},
      {heading: 'Version strings answer different questions', body: 'The CUDA value displayed by nvidia-smi describes driver capability; it is not a report of every toolkit installed on disk. nvcc --version reports that compiler installation. torch.version.cuda describes the CUDA version used to build the installed PyTorch package. These values can differ in a healthy environment. Capture them together and consult the relevant compatibility documentation instead of forcing them to match blindly.'},
      {heading: 'Compatibility is conditional', body: 'CUDA supports documented backward, minor-version, and selected forward-compatibility scenarios. Each has limits, including minimum drivers, supported platforms, GPU requirements, and possible feature or PTX constraints. A version family label is not enough evidence that every application will work. For a deployment, validate the exact framework package, GPU architecture, driver, custom extensions, and libraries as a combination. Avoid unreviewed system-wide upgrades as a first debugging step.'},
      {heading: 'Containers package user space', body: 'A GPU container can make application dependencies reproducible, while NVIDIA Container Toolkit integration exposes permitted devices and driver components. The container still depends on a functioning host driver and a configured container runtime. It does not supply an independent kernel driver that replaces the host’s. Pin image versions or digests for deployments, and verify the application inside the same image that will be shipped.'},
      {heading: 'Compilation adds another compatibility boundary', body: 'Device binaries target particular SM architectures, and packages may also include PTX for just-in-time compilation. A new GPU, an old compiler, or an incompatible extension build can expose gaps in supported targets. Keep custom extension build flags, compiler versions, and dependency locks with the project. An import failure, missing shared library, unsupported architecture, and failed device discovery are different failure classes requiring different evidence.'},
      {heading: 'Checkpoint: reproduce before repairing', body: 'Collect device identity, driver, operating system, framework version, framework CUDA build, and a small allocation-and-compute result. If the host sees the GPU but the container does not, investigate device exposure and runtime configuration. If allocation works but one extension fails, narrow the problem to that extension. Your checkpoint is a one-page environment report and a smallest reproducer, with secrets and private paths excluded before sharing.'}
    ],
    lab: {title: 'Collect an environment report without changing the machine', steps: ['Run the shell commands on the Linux GPU host in the intended Python environment.', 'A missing nvcc is useful evidence and does not by itself prove that framework execution is broken.', 'Run the Python check in your deployment container as a separate comparison if you already have one.', 'Record failures exactly; do not install or remove drivers as part of this inventory exercise.'], code: `# Read-only shell inventory
nvidia-smi
command -v nvcc
nvcc --version
python - <<'PY'
import platform, torch
print("OS:", platform.platform())
print("PyTorch:", torch.__version__)
print("Build CUDA:", torch.version.cuda)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
    x = torch.ones(16, device="cuda")
    print("Computation:", (x + 1).sum().item())
PY`, success: 'Identify which tool reports each layer’s version and determine whether device discovery, allocation, and actual computation work.'},
    quiz: {question: 'PyTorch can compute on CUDA, but nvcc is not installed. What does this imply?', choices: ['The result must have run on the CPU', 'The driver is definitely corrupt', 'The framework can use packaged runtime libraries; CUDA compilation may still need a toolkit', 'Every CUDA extension can be compiled anyway'], answer: 2, explanation: 'Running an existing framework binary and compiling new CUDA code have different dependencies. A missing local compiler is not proof that GPU execution is unavailable.'},
    sources: [{label: 'NVIDIA: CUDA compatibility', url: 'https://docs.nvidia.com/deploy/cuda-compatibility/'}, {label: 'NVIDIA: Linux installation guide', url: 'https://docs.nvidia.com/cuda/cuda-installation-guide-linux/'}, {label: 'NVIDIA: Container Toolkit overview', url: 'https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/index.html'}]
  },
  {
    id: 'pytorch-execution', title: 'See what PyTorch really executes and retains', group: 'Foundations', level: 'Intermediate', minutes: 50,
    summary: 'Connect tensor metadata, views, autograd graphs, asynchronous kernels, and the caching allocator to real memory and runtime behavior.',
    tags: ['PyTorch', 'Strides', 'Autograd', 'Allocator', 'Inference'],
    objectives: ['Use shape, stride, dtype, and device to describe a tensor.', 'Explain activation retention and accidental graph retention.', 'Distinguish allocated memory from reserved memory and external usage.'],
    sections: [
      {heading: 'A tensor includes metadata', body: 'A tensor is more than its displayed numbers. Shape describes logical dimensions; strides describe how those dimensions address storage; dtype controls element representation; device controls placement. Views can share storage while changing metadata. A transpose often changes strides without moving payload bytes. Reshape may return a view or a copy. Inspect contiguity and aliasing before concluding that a harmless-looking layout operation has no downstream cost.'},
      {heading: 'An operator becomes device work', body: 'A Python expression may call a library kernel, several kernels, or framework bookkeeping. Eager execution dispatches operations as the program runs. CUDA operations are commonly asynchronous with respect to the host, so .item(), copying results to CPU, and other synchronization points can expose accumulated device time. A slow-looking line in a Python timer may be the place earlier work is waited on.'},
      {heading: 'Autograd retains what backward needs', body: 'During training, autograd records a graph and saves selected intermediate values required for derivatives. Parameters are only part of the memory budget: activations, gradients, optimizer states, and temporary buffers also matter. Backward normally releases saved intermediates when they are no longer needed. Using retain_graph unnecessarily or storing graph-connected outputs in a long-lived list can extend tensor lifetimes and make memory grow across steps.'},
      {heading: 'Inference has two separate controls', body: 'model.eval() changes modules whose behavior differs between training and evaluation, such as dropout and batch normalization. It does not disable gradient recording. torch.no_grad() or torch.inference_mode() controls autograd behavior for appropriate inference workloads. Inference mode has additional restrictions, so use it where tensors will not later participate in autograd work. A correct inference path chooses both model behavior and gradient policy intentionally.'},
      {heading: 'The caching allocator keeps reusable blocks', body: 'PyTorch tracks live tensor allocations and also reserves device-memory blocks for reuse. Allocated bytes and reserved bytes therefore answer different questions. Deleting a tensor can reduce live allocation while the reserved amount remains high. empty_cache() releases unused cached blocks; it cannot free storage still referenced by live tensors. Device-wide tools may also include contexts, libraries, and allocations outside PyTorch’s allocator, so their totals need not match.'},
      {heading: 'Checkpoint: explain memory after a step', body: 'Measure a representative step after warmup, reset peak counters at a deliberate boundary, and inspect both peak and current allocation. Look for references that retain outputs or graphs before adding cache-clearing calls. Your checkpoint is an explanation of why memory_reserved can exceed memory_allocated without a leak, plus a minimal example of true retention. Record batch size, sequence length, dtype, and training versus inference mode with every memory result.'}
    ],
    lab: {title: 'Observe allocator behavior and gradient state', steps: ['Run on a CUDA-enabled PyTorch installation; this example uses roughly a few megabytes of tensor storage.', 'Observe allocated and reserved memory before allocation, after allocation, after deletion, and after empty_cache.', 'Explain why exact byte counts vary by runtime and existing process state.', 'Use empty_cache here as a teaching observation, not as a recommendation to call it in every training iteration.'], code: `import gc, torch
assert torch.cuda.is_available(), "This lab requires a CUDA GPU"
def report(label):
    torch.cuda.synchronize()
    print(label, "allocated MiB", round(torch.cuda.memory_allocated()/2**20, 2),
          "reserved MiB", round(torch.cuda.memory_reserved()/2**20, 2))
report("start")
x = torch.randn(1024, 1024, device="cuda", requires_grad=True)
y = x.square().mean()
print("y needs gradients:", y.requires_grad)
y.backward()
report("after backward")
del x, y
gc.collect()
report("after delete")
torch.cuda.empty_cache()
report("after empty_cache")`, success: 'Explain each transition using live references and cached blocks. A reserved-memory plateau alone must not be labeled a leak.'},
    quiz: {question: 'What does model.eval() do by itself?', choices: ['Disables all gradient recording', 'Changes behavior of training-sensitive modules', 'Frees every cached GPU allocation', 'Makes every tensor contiguous'], answer: 1, explanation: 'Evaluation mode affects modules such as dropout and batch normalization. Gradient recording is separately controlled by no_grad, inference_mode, and requires_grad.'},
    sources: [{label: 'PyTorch: Tensor views and copies', url: 'https://docs.pytorch.org/docs/stable/tensor_view.html'}, {label: 'PyTorch: Autograd mechanics', url: 'https://docs.pytorch.org/docs/stable/notes/autograd.html'}, {label: 'PyTorch: CUDA memory management', url: 'https://docs.pytorch.org/docs/stable/notes/cuda.html#memory-management'}]
  }
];
